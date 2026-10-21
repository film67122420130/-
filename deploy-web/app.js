(() => {
  'use strict';

  const STORAGE_KEY = 'filee.toolbar.settings.v1';
  const FORMATS = ['PNG', 'JPG', 'WEBP', 'TIFF', 'BMP', 'ICO', 'GIF', 'AVIF', 'PDF', 'DOCX', 'ODT', 'HWPX', 'TXT', 'HTML', 'RTF', 'DOC', 'MARKDOWN'];
  const SIZES = ['ต้นฉบับ', '50%', 'ด้านยาว 1920 พิกเซล', 'ด้านยาว 1280 พิกเซล'];
  const LOCATIONS = ['โฟลเดอร์ต้นฉบับ', 'โฟลเดอร์ย่อย (แปลงแล้ว)', 'เลือกโฟลเดอร์…'];
  const CONFLICTS = ['เพิ่มหมายเลข', 'เขียนทับ', 'ข้าม'];
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CENTER = 160;
  const OUTER_RADIUS = 152;
  const INNER_RADIUS = 62;
  const $ = id => document.getElementById(id);
  const svg = $('fxsvg');
  const pen = $('fxpen');
  const palette = $('fxpal');
  const ghost = $('fxgh');
  const root = $('fx');
  const wheel = $('fxw');
  let hoveredIndex = -1;
  let dragState = null;
  let activeDialog = null;
  let statusTimer = null;
  let saveTimer = null;
  let loadedFile = null;
  let wheelRotation = 0;

  function createId() {
    return globalThis.crypto && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function inferTargetFormat(name) {
    const upperName = String(name || '').toLocaleUpperCase();
    const orderedFormats = ['DOCX', 'HWPX', 'MARKDOWN', 'PNG', 'JPG', 'WEBP', 'TIFF', 'BMP', 'ICO', 'GIF', 'AVIF', 'PDF', 'ODT', 'TXT', 'HTML', 'RTF', 'DOC'];
    return orderedFormats.find(format => upperName.includes(format)) || 'PNG';
  }

  function createPreset(name, id = createId()) {
    return {
      id,
      name,
      targetFormat: inferTargetFormat(name),
      size: name.includes('50%') ? '50%' : 'ต้นฉบับ',
      quality: /^JPG\s*70%$/i.test(name) ? 70 : 80,
      saveLocation: 'โฟลเดอร์ต้นฉบับ',
      conflictPolicy: 'เพิ่มหมายเลข',
      fileNamePattern: '{name}_{preset}',
      keepExif: true
    };
  }

  function createProfile(id, name, extensions, wheelNames, trayNames) {
    return {
      id,
      name,
      extensions,
      wheel: wheelNames.map(name => createPreset(name)),
      tray: trayNames.map(name => createPreset(name))
    };
  }

  function createDefaults() {
    return [
      createProfile('image', 'รูปภาพ', ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp', 'gif', 'heic'],
        ['PNG', 'WEBP', 'PDF', 'TIFF', 'BMP', 'ICO', 'JPG 70%', 'ย่อ 50%'],
        ['GIF', 'AVIF', 'PNG ขาวดำ', 'TIFF 300 dpi']),
      createProfile('pdf', 'PDF', ['pdf'],
        ['PNG', 'JPG', 'DOCX', 'HWPX', 'TXT', 'แยก PDF', 'บีบอัด PDF'],
        ['TIFF', 'PDF/A', 'JPG 150 dpi']),
      createProfile('office', 'เอกสารสำนักงาน', ['docx', 'doc', 'odt', 'rtf', 'xlsx', 'pptx'],
        ['PDF', 'ODT', 'HWPX', 'TXT', 'HTML'],
        ['RTF', 'DOC', 'PDF/A']),
      createProfile('hwp', 'HWP/HWPX', ['hwp', 'hwpx'],
        ['PDF', 'DOCX', 'PNG', 'TXT', 'HWPX'],
        ['ODT', 'HTML', 'Markdown'])
    ];
  }

  function enumOrDefault(value, values, fallback) {
    return values.includes(value) ? value : fallback;
  }

  function normalizePreset(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const name = typeof source.name === 'string' && source.name.trim() ? source.name.trim() : 'พรีเซ็ต';
    const preset = createPreset(name, typeof source.id === 'string' && source.id ? source.id : createId());
    preset.targetFormat = enumOrDefault(source.targetFormat, FORMATS, preset.targetFormat);
    preset.size = enumOrDefault(source.size, SIZES, preset.size);
    preset.quality = Number.isInteger(source.quality) && source.quality >= 10 && source.quality <= 100 ? source.quality : preset.quality;
    preset.saveLocation = enumOrDefault(source.saveLocation, LOCATIONS, preset.saveLocation);
    preset.conflictPolicy = enumOrDefault(source.conflictPolicy, CONFLICTS, preset.conflictPolicy);
    preset.fileNamePattern = typeof source.fileNamePattern === 'string' ? source.fileNamePattern : preset.fileNamePattern;
    preset.keepExif = typeof source.keepExif === 'boolean' ? source.keepExif : true;
    return preset;
  }

  function normalizeExtensions(extensions) {
    const values = Array.isArray(extensions) ? extensions : String(extensions || '').split(',');
    return [...new Set(values
      .filter(value => typeof value === 'string')
      .map(value => value.trim().replace(/^\.+/, '').toLocaleLowerCase())
      .filter(Boolean))];
  }

  function normalizeProfiles(rawProfiles) {
    const defaults = createDefaults();
    if (!Array.isArray(rawProfiles) || !rawProfiles.length) return defaults;

    const profiles = [];
    for (const raw of rawProfiles) {
      if (!raw || typeof raw !== 'object') continue;
      const fallback = defaults.find(profile => profile.id === raw.id || profile.name === raw.name);
      const profile = {
        id: typeof raw.id === 'string' && raw.id ? raw.id : createId(),
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : (fallback?.name || 'โปรไฟล์ใหม่'),
        extensions: normalizeExtensions(raw.extensions ?? fallback?.extensions ?? []),
        wheel: [],
        tray: []
      };
      const sourceWheel = Array.isArray(raw.wheel) ? raw.wheel : (fallback?.wheel || []);
      const sourceTray = Array.isArray(raw.tray) ? raw.tray : (fallback?.tray || []);
      const usedIds = new Set();
      const wheelPresets = sourceWheel.map(normalizePreset);
      const trayPresets = sourceTray.map(normalizePreset);

      for (const preset of wheelPresets) {
        if (usedIds.has(preset.id)) continue;
        usedIds.add(preset.id);
        if (profile.wheel.length < 12) profile.wheel.push(preset);
        else profile.tray.push(preset);
      }
      for (const preset of trayPresets) {
        if (usedIds.has(preset.id)) continue;
        usedIds.add(preset.id);
        profile.tray.push(preset);
      }
      profiles.push(profile);
    }
    return profiles.length ? profiles : defaults;
  }

  function defaultSettings() {
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return { profiles: createDefaults(), selectedProfileId: 'image', reduceMotion };
  }

  function showStatus(message) {
    const status = $('fxmsg');
    status.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status.textContent = '';
      statusTimer = null;
    }, 1600);
  }

  function loadSettings() {
    const fallback = defaultSettings();
    let raw;
    let pending;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      pending = localStorage.getItem(`${STORAGE_KEY}.tmp`);
    } catch (error) {
      console.error('Filee settings could not be read', error);
      showStatus('อ่านการตั้งค่าไม่ได้ จึงใช้ค่าเริ่มต้น');
      return fallback;
    }

    for (const [candidate, key] of [[pending, `${STORAGE_KEY}.tmp`], [raw, STORAGE_KEY]]) {
      if (candidate === null || candidate === undefined) continue;
      try {
        const saved = JSON.parse(candidate);
        const settings = {
          profiles: normalizeProfiles(saved.profiles),
          selectedProfileId: typeof saved.selectedProfileId === 'string' ? saved.selectedProfileId : 'image',
          reduceMotion: typeof saved.reduceMotion === 'boolean' ? saved.reduceMotion : fallback.reduceMotion
        };
        if (!settings.profiles.some(profile => profile.id === settings.selectedProfileId)) {
          settings.selectedProfileId = settings.profiles[0].id;
        }
        if (key.endsWith('.tmp')) {
          localStorage.setItem(STORAGE_KEY, candidate);
          localStorage.removeItem(key);
        } else if (pending !== null) {
          localStorage.removeItem(`${STORAGE_KEY}.tmp`);
        }
        return settings;
      } catch (error) {
        console.error('Filee settings candidate could not be loaded', error);
        if (key === STORAGE_KEY) {
          try {
            localStorage.setItem(`${STORAGE_KEY}.bak`, candidate);
          } catch (backupError) {
            console.error('Corrupt Filee settings could not be backed up', backupError);
          }
        }
      }
    }
    if (pending !== null) localStorage.removeItem(`${STORAGE_KEY}.tmp`);
    if (raw !== null) showStatus('การตั้งค่าเสียหาย ใช้ค่าเริ่มต้นแทน');
    return fallback;
  }

  const state = loadSettings();
  let currentProfileId = state.profiles.some(profile => profile.id === state.selectedProfileId)
    ? state.selectedProfileId
    : state.profiles[0].id;
  root.classList.toggle('red', state.reduceMotion);
  $('fxred').checked = state.reduceMotion;

  function activeProfile() {
    return state.profiles.find(profile => profile.id === currentProfileId) || state.profiles[0];
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function saveSettings() {
    const serialized = JSON.stringify({
      profiles: state.profiles,
      selectedProfileId: currentProfileId,
      reduceMotion: root.classList.contains('red')
    });
    try {
      localStorage.setItem(`${STORAGE_KEY}.tmp`, serialized);
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorage.removeItem(`${STORAGE_KEY}.tmp`);
    } catch (error) {
      console.error('Filee settings could not be saved', error);
      showStatus('บันทึกการตั้งค่าไม่สำเร็จ');
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSettings, 400);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    saveSettings();
  }

  function validateName(profile, presetId, value) {
    const name = String(value).trim();
    if (!name) return { ok: false, message: 'กรุณากรอกชื่อ' };
    const duplicate = [...profile.wheel, ...profile.tray].some(preset =>
      preset.id !== presetId && preset.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    return duplicate
      ? { ok: false, message: 'มีชื่อพรีเซ็ตนี้อยู่แล้ว' }
      : { ok: true, name };
  }

  function findPreset(profile, presetId) {
    return [...profile.wheel, ...profile.tray].find(preset => preset.id === presetId);
  }

  const domain = {
    addToWheel(profile, presetId, targetIndex) {
      const trayIndex = profile.tray.findIndex(preset => preset.id === presetId);
      if (trayIndex < 0) return { ok: false, reason: 'PresetNotInTray' };
      if (profile.wheel.length >= 12) return { ok: false, reason: 'WheelFull' };
      if (targetIndex !== undefined && (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > profile.wheel.length)) {
        return { ok: false, reason: 'InvalidIndex' };
      }
      const index = targetIndex === undefined ? profile.wheel.length : targetIndex;
      const [preset] = profile.tray.splice(trayIndex, 1);
      profile.wheel.splice(index, 0, preset);
      return { ok: true, changed: true };
    },
    moveToTray(profile, presetId) {
      const index = profile.wheel.findIndex(preset => preset.id === presetId);
      if (index < 0) return { ok: false, reason: 'PresetNotInWheel' };
      profile.tray.push(profile.wheel.splice(index, 1)[0]);
      return { ok: true, changed: true };
    },
    moveWithinWheel(profile, fromIndex, toIndex) {
      const count = profile.wheel.length;
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) ||
          fromIndex < 0 || toIndex < 0 || fromIndex >= count || toIndex >= count) {
        return { ok: false, reason: 'InvalidIndex' };
      }
      if (fromIndex === toIndex) return { ok: true, changed: false };
      const [preset] = profile.wheel.splice(fromIndex, 1);
      profile.wheel.splice(toIndex, 0, preset);
      return { ok: true, changed: true };
    },
    validateName,
    updatePreset(profile, presetId, details) {
      const current = findPreset(profile, presetId);
      if (!current) return { ok: false, reason: 'PresetNotFound' };
      const validation = validateName(profile, presetId, details.name);
      if (!validation.ok) return validation;
      const updated = {
        ...current,
        name: validation.name,
        targetFormat: details.targetFormat,
        size: details.size,
        quality: details.quality,
        saveLocation: details.saveLocation,
        conflictPolicy: details.conflictPolicy,
        fileNamePattern: details.fileNamePattern,
        keepExif: details.keepExif
      };
      if (!FORMATS.includes(updated.targetFormat) || !SIZES.includes(updated.size) ||
          !Number.isInteger(updated.quality) || updated.quality < 10 || updated.quality > 100 ||
          !LOCATIONS.includes(updated.saveLocation) || !CONFLICTS.includes(updated.conflictPolicy) ||
          typeof updated.fileNamePattern !== 'string' || typeof updated.keepExif !== 'boolean') {
        return { ok: false, reason: 'InvalidDetails' };
      }
      Object.assign(current, updated);
      return { ok: true, changed: true };
    },
    addProfile() {
      const numbers = state.profiles.map(profile => /^โปรไฟล์ใหม่ (\d+)$/.exec(profile.name))
        .filter(Boolean).map(match => Number(match[1]));
      const nextNumber = (numbers.length ? Math.max(...numbers) : 0) + 1;
      const profile = {
        id: createId(),
        name: `โปรไฟล์ใหม่ ${nextNumber}`,
        extensions: [],
        wheel: [],
        tray: ['PNG', 'JPG', 'PDF', 'WEBP', 'TXT', 'DOCX'].map(name => createPreset(name))
      };
      state.profiles.push(profile);
      domain.selectProfile(profile.id);
      return profile;
    },
    selectProfile(profileId) {
      if (!state.profiles.some(profile => profile.id === profileId)) return { ok: false, reason: 'ProfileNotFound' };
      cancelDrag();
      currentProfileId = profileId;
      render(true);
      scheduleSave();
      return { ok: true };
    },
    setExtensions(profileId, text) {
      const profile = state.profiles.find(item => item.id === profileId);
      if (!profile) return { ok: false, reason: 'ProfileNotFound' };
      profile.extensions = normalizeExtensions(text);
      render(false);
      scheduleSave();
      return { ok: true };
    }
  };

  function profileForExtension(fileExtension) {
    const extension = normalizeExtensions([String(fileExtension).split('.').pop()])[0];
    return state.profiles.find(profile => profile.extensions.includes(extension)) || null;
  }

  function point(radius, angle) {
    return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)];
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getIconForExt(ext) {
    const e = (ext || '').toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'heic', 'avif'].includes(e)) return 'ti ti-photo';
    if (e === 'pdf') return 'ti ti-file-type-pdf';
    if (['doc', 'docx', 'odt', 'rtf'].includes(e)) return 'ti ti-file-type-doc';
    if (['xls', 'xlsx'].includes(e)) return 'ti ti-file-type-xls';
    if (['ppt', 'pptx'].includes(e)) return 'ti ti-file-type-ppt';
    if (['txt', 'md', 'markdown'].includes(e)) return 'ti ti-file-type-txt';
    return 'ti ti-file';
  }

  function updateCenterDisplay() {
    const icon = $('fxc-icon');
    const name = $('fxc-name');
    const desc = $('fxc-desc');
    const center = $('fxcenter');
    if (!icon || !name || !desc || !center) return;

    if (loadedFile) {
      name.textContent = loadedFile.name;
      desc.textContent = formatBytes(loadedFile.size);
      center.style.background = 'var(--bg-accent)';
      center.style.borderColor = 'var(--border-accent)';
      icon.className = getIconForExt(loadedFile.ext);
      icon.style.color = 'var(--text-accent)';
    } else {
      const profile = activeProfile();
      name.textContent = profile.name;
      desc.textContent = 'ลากไฟล์มาวางที่นี่';
      center.style.background = 'var(--surface-1)';
      center.style.borderColor = 'var(--border-strong)';
      icon.className = 'ti ti-file-upload';
      icon.style.color = 'var(--text-secondary)';
    }
  }

  function handleFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    loadedFile = {
      name: file.name,
      size: file.size,
      type: file.type,
      ext,
      file
    };
    const matched = profileForExtension(ext);
    if (matched && matched.id !== currentProfileId) {
      currentProfileId = matched.id;
      showStatus(`สลับไปโปรไฟล์ "${matched.name}" ให้โดยอัตโนมัติ`);
    } else {
      showStatus(`โหลดไฟล์ "${file.name}" เรียบร้อยแล้ว`);
    }
    updateCenterDisplay();
    render(true);
  }

  function setWheelRotation(deg) {
    wheelRotation = ((deg % 360) + 360) % 360;
    const rotGroup = $('fx-rotatable-group');
    if (rotGroup) {
      rotGroup.setAttribute('transform', `rotate(${wheelRotation} ${CENTER} ${CENTER})`);
    }
    if (hoveredIndex >= 0) {
      setHovered(hoveredIndex);
    }
  }

  function hitTest(x, y, width, count, hoverExpansion = 0) {
    if (count <= 0 || width <= 0) return -1;
    const scale = 320 / width;
    const dx = (x - width / 2) * scale;
    const dy = (y - width / 2) * scale;
    const distance = Math.hypot(dx, dy);
    if (distance < INNER_RADIUS || distance > OUTER_RADIUS + hoverExpansion) return -1;
    if (count === 1) return 0;
    let angle = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    let effectiveAngle = (angle - wheelRotation + 720) % 360;
    const step = 360 / count;
    return Math.floor(((effectiveAngle + step / 2) % 360) / step);
  }

  function hitTestClient(clientX, clientY, expansion = 0) {
    const bounds = wheel.getBoundingClientRect();
    return hitTest(clientX - bounds.left, clientY - bounds.top, bounds.width, activeProfile().wheel.length, expansion);
  }

  function segmentPath(index, count) {
    if (count === 1) {
      return `M${CENTER - OUTER_RADIUS} ${CENTER}A${OUTER_RADIUS} ${OUTER_RADIUS} 0 1 0 ${CENTER + OUTER_RADIUS} ${CENTER}A${OUTER_RADIUS} ${OUTER_RADIUS} 0 1 0 ${CENTER - OUTER_RADIUS} ${CENTER}M${CENTER - INNER_RADIUS} ${CENTER}A${INNER_RADIUS} ${INNER_RADIUS} 0 1 1 ${CENTER + INNER_RADIUS} ${CENTER}A${INNER_RADIUS} ${INNER_RADIUS} 0 1 1 ${CENTER - INNER_RADIUS} ${CENTER}Z`;
    }
    const step = 2 * Math.PI / count;
    const start = -Math.PI / 2 + index * step - step / 2;
    const end = start + step;
    const [ax, ay] = point(OUTER_RADIUS, start);
    const [bx, by] = point(OUTER_RADIUS, end);
    const [cx, cy] = point(INNER_RADIUS, end);
    const [dx, dy] = point(INNER_RADIUS, start);
    return `M${ax} ${ay}A${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${bx} ${by}L${cx} ${cy}A${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${dx} ${dy}Z`;
  }

  function svgElement(tag, attributes) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function clearHighlights() {
    svg.querySelectorAll('.fxS').forEach(segment => {
      segment.classList.remove('hot', 'drop', 'dim');
      segment.style.transform = '';
    });
    palette.style.borderColor = '';
  }

  function setHovered(index) {
    if (activeDialog || dragState?.phase === 'dragging') return;
    hoveredIndex = index;
    clearHighlights();
    if (index < 0) {
      pen.style.visibility = 'hidden';
      return;
    }
    const count = activeProfile().wheel.length;
    const segment = svg.querySelector(`[data-seg="${index}"]`);
    if (!segment) {
      pen.style.visibility = 'hidden';
      return;
    }
    segment.classList.add('hot');
    const rad = (wheelRotation * Math.PI) / 180;
    const angle = -Math.PI / 2 + index * 2 * Math.PI / count + rad;
    if (count > 1) segment.style.transform = `translate(${Math.cos(angle) * 6}px,${Math.sin(angle) * 6}px)`;
    const [x, y] = count === 1 ? [CENTER, CENTER - 138] : point(140, angle);
    pen.style.left = `${x - 14}px`;
    pen.style.top = `${y - 14}px`;
    pen.style.visibility = 'visible';
  }

  function render(animateEntry = false) {
    const profile = activeProfile();
    const count = profile.wheel.length;
    svg.replaceChildren();

    if (!count) {
      svg.append(svgElement('circle', {
        cx: CENTER, cy: CENTER, r: (INNER_RADIUS + OUTER_RADIUS) / 2,
        fill: 'none', 'stroke-width': OUTER_RADIUS - INNER_RADIUS,
        style: 'stroke:var(--surface-2)'
      }));
    }

    const rotGroup = svgElement('g', {
      id: 'fx-rotatable-group',
      transform: `rotate(${wheelRotation} ${CENTER} ${CENTER})`
    });

    profile.wheel.forEach((preset, index) => {
      const entry = svgElement('g', { class: 'fxA' });
      entry.style.animationDelay = `${index * 30}ms`;
      if (!animateEntry || root.classList.contains('red')) entry.style.animation = 'none';
      const segment = svgElement('g', { class: 'fxS', 'data-seg': index });
      const path = svgElement('path', { d: segmentPath(index, count) });
      if (count === 1) path.setAttribute('fill-rule', 'evenodd');
      const angle = -Math.PI / 2 + index * 2 * Math.PI / count;
      const [x, y] = count === 1 ? [CENTER, CENTER - (INNER_RADIUS + OUTER_RADIUS) / 2] : point(102, angle);
      const label = svgElement('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
      label.textContent = preset.name;
      segment.append(path, label);
      entry.append(segment);
      rotGroup.append(entry);
    });

    svg.append(rotGroup);
    updateCenterDisplay();

    $('fxext').textContent = `นามสกุลไฟล์ที่รองรับ: ${profile.extensions.join(', ') || '(แก้ไขได้)'}`;
    $('fxprof').replaceChildren();
    state.profiles.forEach(item => {
      const button = document.createElement('button');
      button.className = `fxpf${item.id === currentProfileId ? ' on' : ''}`;
      button.textContent = item.name;
      button.addEventListener('click', () => domain.selectProfile(item.id));
      $('fxprof').append(button);
    });
    palette.replaceChildren();
    profile.tray.forEach(preset => {
      const chip = document.createElement('span');
      chip.className = 'fxchip';
      chip.dataset.presetId = preset.id;
      chip.innerHTML = `<i class="ti ti-grip-vertical"></i>${escapeHtml(preset.name)}`;
      palette.append(chip);
    });
    hoveredIndex = -1;
    pen.style.visibility = 'hidden';
    clearHighlights();
  }

  function beginDrag(source, event) {
    if (activeDialog || event.button !== 0 || dragState) return;
    event.preventDefault();
    dragState = {
      ...source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      phase: 'pending'
    };
    try {
      root.setPointerCapture(event.pointerId);
    } catch (error) {
      dragState = null;
      console.error('Pointer capture could not be started', error);
    }
  }

  function dragTargetAt(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    const segment = element?.closest('[data-seg]');
    if (segment) return { type: 'segment', index: Number(segment.dataset.seg) };
    const bounds = wheel.getBoundingClientRect();
    if (clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom) {
      return { type: 'wheel', index: -1 };
    }
    if (element?.closest('#fxpal')) return { type: 'tray', index: -1 };
    return { type: 'none', index: -1 };
  }

  function cancelDrag() {
    if (!dragState) {
      ghost.style.visibility = 'hidden';
      clearHighlights();
      return;
    }
    const pointerId = dragState.pointerId;
    dragState = null;
    ghost.style.visibility = 'hidden';
    clearHighlights();
    try {
      if (root.hasPointerCapture(pointerId)) root.releasePointerCapture(pointerId);
    } catch (error) {
      console.error('Pointer capture could not be released', error);
    }
  }

  function finishDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const completed = dragState;
    const target = completed.phase === 'dragging'
      ? dragTargetAt(event.clientX, event.clientY)
      : { type: 'none', index: -1 };
    dragState = null;
    ghost.style.visibility = 'hidden';
    clearHighlights();
    try {
      if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    } catch (error) {
      console.error('Pointer capture could not be released', error);
    }
    if (completed.phase !== 'dragging') {
      if (completed.source === 'wheel') {
        const preset = activeProfile().wheel[completed.index];
        if (preset) openConfirmationDialog(preset);
      }
      return;
    }

    const profile = activeProfile();
    let result = { ok: false };
    if (completed.source === 'wheel') {
      const preset = profile.wheel[completed.index];
      if (preset && target.type === 'tray') result = domain.moveToTray(profile, preset.id);
      else if (preset && target.type === 'segment' && target.index !== completed.index) {
        result = domain.moveWithinWheel(profile, completed.index, target.index);
      }
    } else if (completed.source === 'tray') {
      if (target.type === 'segment') result = domain.addToWheel(profile, completed.presetId, target.index);
      else if (target.type === 'wheel') result = domain.addToWheel(profile, completed.presetId);
      if (result.reason === 'WheelFull') showStatus('เพิ่มได้สูงสุด 12 รายการ');
    }
    if (result.ok && result.changed) scheduleSave();
    render(false);
  }

  function onPointerMove(event) {
    if (!dragState && !activeDialog) {
      const bounds = wheel.getBoundingClientRect();
      if (event.clientX >= bounds.left && event.clientX <= bounds.right &&
          event.clientY >= bounds.top && event.clientY <= bounds.bottom) {
        setHovered(hitTestClient(event.clientX, event.clientY, 6));
      } else {
        setHovered(-1);
      }
    }
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (dragState.phase === 'pending' &&
        Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 5) {
      dragState.phase = 'dragging';
      hoveredIndex = -1;
      pen.style.visibility = 'hidden';
      ghost.textContent = dragState.presetName;
      ghost.style.visibility = 'visible';
    }
    if (dragState.phase !== 'dragging') return;

    const rootBounds = root.getBoundingClientRect();
    ghost.style.left = `${event.clientX - rootBounds.left + 10}px`;
    ghost.style.top = `${event.clientY - rootBounds.top + 10}px`;
    clearHighlights();
    const target = dragTargetAt(event.clientX, event.clientY);
    if (target.type === 'segment') svg.querySelector(`[data-seg="${target.index}"]`)?.classList.add('drop');
    if (target.type === 'tray' && dragState.source === 'wheel') palette.style.borderColor = 'var(--border-accent)';
    if (dragState.source === 'wheel') svg.querySelector(`[data-seg="${dragState.index}"]`)?.classList.add('dim');
  }

  function selectHtml(id, options, value) {
    return `<select id="${id}" style="font-size:12px;width:100%">${options.map(option =>
      `<option${option === value ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>`;
  }

  function openConfirmationDialog(preset) {
    if (activeDialog) return;
    const profile = activeProfile();
    const file = loadedFile || {
      name: `ตัวอย่าง_${preset.name.toLowerCase()}.${profile.extensions[0] || 'png'}`,
      size: 2450000,
      ext: profile.extensions[0] || 'png'
    };

    const destName = `${file.name.replace(/\.[^.]+$/, '')}_${preset.name}.${preset.targetFormat.toLowerCase()}`;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:10;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="background:var(--surface-2);border:1px solid var(--border-strong);border-radius:14px;padding:18px 20px;width:400px;font-size:13px;box-shadow:0 8px 30px rgba(0,0,0,.25)">
        <div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px;margin-bottom:12px;color:var(--text-accent)">
          <i class="ti ti-refresh" style="font-size:18px"></i> ยืนยันการแปลงไฟล์
        </div>
        
        <div style="background:var(--surface-1);border-radius:10px;padding:12px;margin-bottom:12px;display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-secondary)">ไฟล์ต้นฉบับ:</span>
            <span style="font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(file.name)}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-secondary)">ขนาดไฟล์:</span>
            <span>${formatBytes(file.size)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;border-top:1px dashed var(--border);padding-top:6px;margin-top:2px">
            <span style="color:var(--text-secondary)">รูปแบบเป้าหมาย:</span>
            <span style="font-weight:700;color:var(--text-accent)">${preset.targetFormat} (${preset.name})</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-secondary)">คุณภาพ / ขนาด:</span>
            <span>${preset.quality}% · ${preset.size}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-secondary)">ชื่อไฟล์ใหม่:</span>
            <span style="font-family:monospace;font-size:11px;color:var(--text-primary)">${escapeHtml(destName)}</span>
          </div>
        </div>

        ${!loadedFile ? '<div style="font-size:11px;color:var(--text-warning);margin-bottom:10px"><i class="ti ti-info-circle"></i> คุณยังไม่ได้ลากไฟล์เข้ามา ระบบจะใช้ไฟล์ตัวอย่างสำหรับการทดลองนี้ (หรือลากไฟล์จริงมาวางที่กลางวงล้อได้เลย)</div>' : ''}

        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button id="cfCancel" style="padding:6px 14px">ยกเลิก</button>
          <button id="cfConfirm" style="padding:6px 16px;background:var(--bg-accent);color:var(--text-accent);border-color:var(--border-accent);font-weight:600">
            <i class="ti ti-check"></i> ยืนยันการแปลงไฟล์
          </button>
        </div>
      </div>
    `;

    $('fxed').append(overlay);
    activeDialog = overlay;

    const close = () => {
      overlay.remove();
      activeDialog = null;
    };

    $('cfCancel').addEventListener('click', close);
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });

    $('cfConfirm').addEventListener('click', () => {
      close();
      openSuccessModal(preset, file, destName);
    });
  }
  /* ═══════════════════════════════════════════════════════════════════════
     UNIVERSAL CONVERSION ENGINE v3 — จัดการแปลงไฟล์จริงครบทุกประเภท
     Dependencies:
       - jsPDF       : ภาพ/ข้อความ/เอกสาร → PDF
       - mammoth.js  : DOCX/DOC → HTML, TXT, PDF (ดึงเนื้อหา/ตาราง/ฟอนต์)
       - PDF.js      : PDF → Canvas → PNG/JPG, สกัดข้อความจาก PDF
       - html2canvas : เรนเดอร์ HTML/DOCX ลง Canvas พร้อมภาษาไทยครบถ้วน
       - JSZip       : แยก/รวมไฟล์ ZIP, HWPX, DOCX generator
     ═══════════════════════════════════════════════════════════════════════ */

  function ensurePdfWorker() {
    if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  function escapeXml(value) {
    return String(value || '').replace(/[<>&'"]/g, c => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }

  function analyzePreset(preset, srcW, srcH) {
    const name = (preset.name || '').toUpperCase();
    const fmt = (preset.targetFormat || 'PNG').toUpperCase();
    let grayscale = name.includes('ขาวดำ') || name.includes('GRAYSCALE');
    let quality = Math.max(0.1, Math.min(1.0, (preset.quality || 80) / 100));
    let scaleW = srcW, scaleH = srcH;

    const sz = preset.size || 'ต้นฉบับ';
    if (sz === '50%' || name.includes('50%') || name.includes('ย่อ')) {
      scaleW = Math.round(srcW * 0.5);
      scaleH = Math.round(srcH * 0.5);
    } else if (sz.includes('1920') || name.includes('1920')) {
      const long = Math.max(srcW, srcH);
      if (long > 1920) { const r = 1920 / long; scaleW = Math.round(srcW * r); scaleH = Math.round(srcH * r); }
    } else if (sz.includes('1280') || name.includes('1280')) {
      const long = Math.max(srcW, srcH);
      if (long > 1280) { const r = 1280 / long; scaleW = Math.round(srcW * r); scaleH = Math.round(srcH * r); }
    }

    const qMatch = name.match(/(\d{2,3})\s*%/);
    if (qMatch) quality = Math.max(0.1, Math.min(1.0, Number(qMatch[1]) / 100));

    let mime, realExt;
    switch (fmt) {
      case 'JPG':
      case 'JPEG':
        mime = 'image/jpeg'; realExt = 'jpg'; break;
      case 'WEBP':
        mime = 'image/webp'; realExt = 'webp'; break;
      case 'PNG':
        mime = 'image/png'; realExt = 'png'; break;
      case 'AVIF':
        mime = 'image/avif'; realExt = 'avif'; break;
      case 'ICO':
        mime = 'image/x-icon'; realExt = 'ico'; break;
      case 'BMP':
        mime = 'image/bmp'; realExt = 'bmp'; break;
      case 'TIFF':
        mime = 'image/tiff'; realExt = 'tiff'; break;
      case 'GIF':
        mime = 'image/gif'; realExt = 'gif'; break;
      default:
        mime = 'image/png'; realExt = 'png';
    }

    // ตรวจสอบ AVIF ในเบราว์เซอร์
    if (mime === 'image/avif') {
      const testC = document.createElement('canvas'); testC.width = testC.height = 1;
      if (!testC.toDataURL('image/avif').startsWith('data:image/avif')) mime = 'image/webp';
    }
    return { grayscale, scaleW: Math.max(1, scaleW), scaleH: Math.max(1, scaleH), quality, mime, realExt };
  }

  function loadImageElement(fileObj) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ภาพได้'));
      reader.onload = e => {
        const img = new Image();
        img.onerror = () => reject(new Error('ไฟล์ภาพเสียหายหรือไม่รองรับ'));
        img.onload = () => resolve(img);
        img.src = e.target.result;
      };
      reader.readAsDataURL(fileObj);
    });
  }

  function drawToCanvas(imgEl, opts) {
    const w = opts.realExt === 'ico' ? Math.min(256, opts.scaleW) : opts.scaleW;
    const h = opts.realExt === 'ico' ? Math.min(256, opts.scaleH) : opts.scaleH;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, w, h);
    if (opts.grayscale) {
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        d[i] = d[i + 1] = d[i + 2] = lum;
      }
      ctx.putImageData(imgData, 0, 0);
    }
    return canvas;
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob ล้มเหลว'));
      }, mime, quality);
    });
  }

  function canvasToBmpBlob(canvas) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const rowSize = Math.floor((24 * w + 31) / 32) * 4;
    const pixelArraySize = rowSize * h;
    const fileSize = 54 + pixelArraySize;
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    view.setUint16(0, 0x4D42, false); // BM
    view.setUint32(2, fileSize, true);
    view.setUint32(10, 54, true);

    view.setUint32(14, 40, true);
    view.setInt32(18, w, true);
    view.setInt32(22, h, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    view.setUint32(30, 0, true);
    view.setUint32(34, pixelArraySize, true);

    let offset = 54;
    for (let y = h - 1; y >= 0; y--) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        view.setUint8(offset++, d[i + 2]); // B
        view.setUint8(offset++, d[i + 1]); // G
        view.setUint8(offset++, d[i]);     // R
      }
      const padding = rowSize - w * 3;
      for (let p = 0; p < padding; p++) view.setUint8(offset++, 0);
    }
    return new Blob([buffer], { type: 'image/bmp' });
  }

  async function canvasToIcoBlob(canvas) {
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 32;
    iconCanvas.height = 32;
    const ctx = iconCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, 32, 32);
    const pngBlob = await new Promise(r => iconCanvas.toBlob(r, 'image/png'));
    const pngBuf = await pngBlob.arrayBuffer();
    const pngBytes = new Uint8Array(pngBuf);

    const icoSize = 6 + 16 + pngBytes.length;
    const buffer = new ArrayBuffer(icoSize);
    const view = new DataView(buffer);

    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, 1, true);

    view.setUint8(6, 32);
    view.setUint8(7, 32);
    view.setUint8(8, 0);
    view.setUint8(9, 0);
    view.setUint16(10, 1, true);
    view.setUint16(12, 32, true);
    view.setUint32(14, pngBytes.length, true);
    view.setUint32(18, 22, true);

    new Uint8Array(buffer, 22).set(pngBytes);
    return new Blob([buffer], { type: 'image/x-icon' });
  }

  async function imageToPdfBlob(imgEl, destName, opts) {
    if (!window.jspdf?.jsPDF) {
      const canvas = drawToCanvas(imgEl, opts);
      return canvasToBlob(canvas, 'image/png');
    }
    const { jsPDF } = window.jspdf;
    const orientation = imgEl.width >= imgEl.height ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 10;
    const maxW = pw - margin * 2;
    const maxH = ph - margin * 2;
    const ratio = Math.min(maxW / imgEl.width, maxH / imgEl.height);
    const w = imgEl.width * ratio;
    const h = imgEl.height * ratio;
    const x = (pw - w) / 2;
    const y = (ph - h) / 2;

    const canvas = drawToCanvas(imgEl, opts);
    const dataUrl = canvas.toDataURL('image/jpeg', opts.quality);
    doc.addImage(dataUrl, 'JPEG', x, y, w, h);
    return doc.output('blob');
  }

  async function pdfPageToCanvas(fileObj, pageNum = 1, scale = 2.0) {
    ensurePdfWorker();
    if (!window.pdfjsLib) throw new Error('PDF.js ไม่ได้โหลด');
    const buf = await fileObj.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(pageNum);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return canvas;
  }

  async function pdfToText(fileObj) {
    ensurePdfWorker();
    if (!window.pdfjsLib) return '(PDF.js ไม่ได้โหลด)';
    const buf = await fileObj.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const parts = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      parts.push(`=== หน้า ${p} ===\n${pageText}`);
    }
    return parts.join('\n\n');
  }

  async function compressPdf(fileObj) {
    ensurePdfWorker();
    if (!window.pdfjsLib || !window.jspdf?.jsPDF) return fileObj;
    const buf = await fileObj.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const { jsPDF } = window.jspdf;
    let outDoc = null;

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

      const orientation = vp.width >= vp.height ? 'landscape' : 'portrait';
      if (!outDoc) {
        outDoc = new jsPDF({ orientation, unit: 'px', format: [vp.width, vp.height] });
      } else {
        outDoc.addPage([vp.width, vp.height], orientation);
      }
      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      outDoc.addImage(dataUrl, 'JPEG', 0, 0, vp.width, vp.height);
    }
    return outDoc.output('blob');
  }

  async function docxToHtml(fileObj) {
    if (!window.mammoth) throw new Error('mammoth.js ไม่ได้โหลด');
    const buf = await fileObj.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: buf });
    return result.value;
  }

  async function docxToText(fileObj) {
    if (!window.mammoth) throw new Error('mammoth.js ไม่ได้โหลด');
    const buf = await fileObj.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value;
  }

  async function parseHwpxText(fileObj) {
    if (!window.JSZip) {
      return '(HWPX: JSZip ไม่พร้อมใช้งาน)';
    }
    try {
      const buf = await fileObj.arrayBuffer();
      const zip = await JSZip.loadAsync(buf);
      let fullText = '';
      for (const [filename, fileEntry] of Object.entries(zip.files)) {
        if (/section\d+\.xml$/i.test(filename) || /content\.xml$/i.test(filename)) {
          const xml = await fileEntry.async('text');
          const clean = xml.replace(/<hp:p[^>]*>/gi, '\n')
                           .replace(/<[^>]+>/g, '')
                           .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
          fullText += clean + '\n\n';
        }
      }
      return fullText.trim() || 'เอกสาร HWPX (ไม่มีข้อความ)';
    } catch (e) {
      return `HWPX Parse Error: ${e.message}`;
    }
  }

  function htmlToMarkdown(html) {
    return String(html || '')
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<ul[^>]*>|<\/ul>|<ol[^>]*>|<\/ol>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function htmlToPdfBlob(htmlContent, title) {
    if (!window.jspdf?.jsPDF) {
      return new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    }
    const { jsPDF } = window.jspdf;

    const sandbox = document.createElement('div');
    sandbox.id = 'filee-pdf-sandbox';
    sandbox.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#ffffff;color:#1f1e1d;padding:48px;box-sizing:border-box;font-family:"Noto Sans Thai","Leelawadee UI",Tahoma,sans-serif;font-size:14px;line-height:1.75;word-break:break-word;z-index:-1000;';
    sandbox.innerHTML = `
      <style>
        #filee-pdf-sandbox h1 { font-size: 22px; font-weight: 700; margin: 0 0 16px; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
        #filee-pdf-sandbox h2 { font-size: 18px; font-weight: 700; margin: 20px 0 12px; color: #1f2937; }
        #filee-pdf-sandbox h3 { font-size: 16px; font-weight: 600; margin: 16px 0 8px; color: #374151; }
        #filee-pdf-sandbox p { margin: 0 0 10px; line-height: 1.7; color: #1f1e1d; }
        #filee-pdf-sandbox table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
        #filee-pdf-sandbox th, #filee-pdf-sandbox td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
        #filee-pdf-sandbox th { background: #f3f4f6; font-weight: 600; }
        #filee-pdf-sandbox ul, #filee-pdf-sandbox ol { margin: 0 0 12px; padding-left: 24px; }
        #filee-pdf-sandbox li { margin-bottom: 4px; }
        #filee-pdf-sandbox img { max-width: 100%; height: auto; margin: 10px 0; }
      </style>
      <div>${htmlContent}</div>
    `;
    document.body.appendChild(sandbox);

    try {
      if (window.html2canvas) {
        const canvas = await html2canvas(sandbox, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pdfWidth = pdf.internal.pageSize.getWidth(); // 210
        const pdfHeight = pdf.internal.pageSize.getHeight(); // 297

        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const pageCanvasHeight = (pdfHeight * canvasWidth) / pdfWidth;

        let currentHeight = 0;
        while (currentHeight < canvasHeight) {
          if (currentHeight > 0) pdf.addPage();
          
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvasWidth;
          const sliceHeight = Math.min(pageCanvasHeight, canvasHeight - currentHeight);
          sliceCanvas.height = sliceHeight;

          const sliceCtx = sliceCanvas.getContext('2d');
          sliceCtx.drawImage(canvas, 0, currentHeight, canvasWidth, sliceHeight, 0, 0, canvasWidth, sliceHeight);

          const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.95);
          const slicePdfHeight = (sliceHeight * pdfWidth) / canvasWidth;
          pdf.addImage(sliceDataUrl, 'JPEG', 0, 0, pdfWidth, slicePdfHeight);

          currentHeight += pageCanvasHeight;
        }

        return pdf.output('blob');
      } else {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        pdf.text(title || 'Document', 15, 15);
        return pdf.output('blob');
      }
    } finally {
      sandbox.remove();
    }
  }

  async function textToDocxBlob(textOrHtml, title) {
    if (window.JSZip) {
      const zip = new JSZip();
      zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

      zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

      const paragraphs = textOrHtml.split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`)
        .join('');

      zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs || '<w:p><w:r><w:t>Filee Converted Document</w:t></w:r></w:p>'}
  </w:body>
</w:document>`);

      return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    } else {
      const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${escapeHtml(title)}</title></head><body>${textOrHtml.replace(/\n/g, '<br>')}</body></html>`;
      return new Blob([docHtml], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }
  }

  function blobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     MASTER CONVERSION DISPATCHER
     ═══════════════════════════════════════════════════════════════════════ */
  async function performConversion(destName, file, preset) {
    const fmt = (preset.targetFormat || 'PNG').toUpperCase();
    const pname = (preset.name || '').toUpperCase();
    const srcExt = (file.ext || '').toLowerCase();
    const hasRealFile = !!file.file;
    const isImageSrc = hasRealFile && file.file.type.startsWith('image/');
    const isPdfSrc = srcExt === 'pdf';
    const isDocxSrc = ['docx', 'doc', 'odt', 'rtf'].includes(srcExt);
    const isHwpSrc = ['hwp', 'hwpx'].includes(srcExt);
    const isTextSrc = ['txt', 'md', 'html', 'markdown', 'csv'].includes(srcExt);

    // ① ไฟล์ต้นทางเป็น รูปภาพ
    if (isImageSrc) {
      const imgEl = await loadImageElement(file.file);
      const opts = analyzePreset(preset, imgEl.width, imgEl.height);

      if (fmt === 'PDF') {
        return await imageToPdfBlob(imgEl, destName, opts);
      }
      if (fmt === 'BMP') {
        const canvas = drawToCanvas(imgEl, opts);
        return canvasToBmpBlob(canvas);
      }
      if (fmt === 'ICO') {
        const canvas = drawToCanvas(imgEl, opts);
        return await canvasToIcoBlob(canvas);
      }
      const canvas = drawToCanvas(imgEl, opts);
      return await canvasToBlob(canvas, opts.mime, opts.quality);
    }

    // ② ไฟล์ต้นทางเป็น PDF
    if (isPdfSrc && hasRealFile) {
      if (['PNG', 'JPG', 'JPEG', 'WEBP'].includes(fmt)) {
        let scale = 2.0;
        if (pname.includes('150 DPI')) scale = 150 / 72;
        if (pname.includes('300 DPI') || fmt === 'TIFF') scale = 300 / 72;
        const canvas = await pdfPageToCanvas(file.file, 1, scale);
        const mime = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
        return await canvasToBlob(canvas, mime, 0.95);
      }
      if (fmt === 'TXT') {
        const text = await pdfToText(file.file);
        return new Blob([text], { type: 'text/plain;charset=utf-8' });
      }
      if (fmt === 'DOCX') {
        const text = await pdfToText(file.file);
        return await textToDocxBlob(text, destName);
      }
      if (pname.includes('บีบอัด') || pname.includes('COMPRESS')) {
        return await compressPdf(file.file);
      }
      if (pname.includes('แยก') || pname.includes('SPLIT')) {
        // แยกหน้าแรกเป็น PDF เดี่ยว
        const canvas = await pdfPageToCanvas(file.file, 1, 2.0);
        const imgEl = await new Promise(r => {
          const img = new Image();
          img.onload = () => r(img);
          img.src = canvas.toDataURL('image/jpeg', 0.95);
        });
        return await imageToPdfBlob(imgEl, destName, { quality: 0.95 });
      }
      // PDF/A หรือ PDF ทั่วไป
      return file.file;
    }

    // ③ ไฟล์ต้นทางเป็น DOCX / DOC / ODT / RTF
    if (isDocxSrc && hasRealFile) {
      if (fmt === 'PDF') {
        let html;
        try {
          html = await docxToHtml(file.file);
        } catch {
          const raw = await docxToText(file.file);
          html = `<p>${escapeHtml(raw).replace(/\n/g, '<br>')}</p>`;
        }
        return await htmlToPdfBlob(html, file.name);
      }
      if (fmt === 'HTML') {
        const html = await docxToHtml(file.file);
        const fullDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(file.name)}</title><style>body{font-family:"Noto Sans Thai",Tahoma,sans-serif;max-width:860px;margin:40px auto;padding:0 24px;line-height:1.7}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px}</style></head><body>${html}</body></html>`;
        return new Blob([fullDoc], { type: 'text/html;charset=utf-8' });
      }
      if (fmt === 'TXT') {
        const text = await docxToText(file.file);
        return new Blob([text], { type: 'text/plain;charset=utf-8' });
      }
      if (fmt === 'MARKDOWN') {
        const html = await docxToHtml(file.file);
        const md = htmlToMarkdown(html);
        return new Blob([md], { type: 'text/markdown;charset=utf-8' });
      }
      if (fmt === 'DOCX') {
        return file.file;
      }
      // ODT / HWPX
      const text = await docxToText(file.file);
      return await textToDocxBlob(text, destName);
    }

    // ④ ไฟล์ต้นทางเป็น HWP / HWPX
    if (isHwpSrc && hasRealFile) {
      const text = await parseHwpxText(file.file);
      if (fmt === 'PDF') {
        const html = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
        return await htmlToPdfBlob(html, file.name);
      }
      if (fmt === 'DOCX') {
        return await textToDocxBlob(text, destName);
      }
      if (fmt === 'HTML') {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(file.name)}</title></head><body><pre style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(text)}</pre></body></html>`;
        return new Blob([html], { type: 'text/html;charset=utf-8' });
      }
      return new Blob([text], { type: 'text/plain;charset=utf-8' });
    }

    // ⑤ ไฟล์ต้นทางเป็น TXT / Markdown / HTML / CSV
    if (isTextSrc && hasRealFile) {
      const text = await file.file.text();
      if (fmt === 'PDF') {
        const html = `<pre style="white-space:pre-wrap;font-family:'Noto Sans Thai',sans-serif">${escapeHtml(text)}</pre>`;
        return await htmlToPdfBlob(html, file.name);
      }
      if (fmt === 'HTML') {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(file.name)}</title></head><body><pre style="white-space:pre-wrap">${escapeHtml(text)}</pre></body></html>`;
        return new Blob([html], { type: 'text/html;charset=utf-8' });
      }
      if (fmt === 'DOCX') {
        return await textToDocxBlob(text, destName);
      }
      return new Blob([text], { type: 'text/plain;charset=utf-8' });
    }

    // ⑥ กรณีไม่มีไฟล์จริง หรือชนิดอื่น ๆ
    if (hasRealFile) {
      return file.file;
    }

    // เดโม่จำลองเมื่อไม่มีไฟล์จริง
    const demoText = `Filee Converted Result\nSource: ${file.name}\nPreset: ${preset.name} (${fmt})\nDate: ${new Date().toLocaleString('th-TH')}`;
    if (fmt === 'PDF') {
      return await htmlToPdfBlob(`<h1>Filee Preview</h1><p>${escapeHtml(demoText).replace(/\n/g, '<br>')}</p>`, destName);
    }
    return new Blob([demoText], { type: 'text/plain;charset=utf-8' });
  }

  function openSuccessModal(preset, file, destName) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:20;backdrop-filter:blur(3px)';

    overlay.innerHTML = `
      <div style="background:var(--surface-2);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:16px;padding:24px 28px;width:400px;max-width:92vw;display:flex;flex-direction:column;align-items:center;text-align:center;box-shadow:0 12px 36px rgba(0,0,0,.25);transition:all .3s">
        <!-- สถานะกำลังแปลง (Loading State) -->
        <div id="cvLoading" style="display:flex;flex-direction:column;align-items:center;padding:12px 0;width:100%">
          <div style="width:48px;height:48px;border:3.5px solid var(--border-strong);border-top-color:var(--border-accent);border-radius:50%;animation:fxspin .7s linear infinite;margin-bottom:14px"></div>
          <div style="font-size:16px;font-weight:700;margin-bottom:4px">กำลังประมวลผลและแปลงไฟล์...</div>
          <div style="font-size:12.5px;color:var(--text-secondary);max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(file.name)} ➔ ${preset.targetFormat}</div>
          <div style="width:100%;height:7px;background:var(--surface-1);border-radius:4px;margin-top:16px;overflow:hidden">
            <div id="cvPBar" style="width:15%;height:100%;background:var(--text-accent);border-radius:4px;transition:width .35s ease"></div>
          </div>
        </div>

        <!-- สถานะสำเร็จ (Success State) -->
        <div id="cvSuccess" style="display:none;flex-direction:column;align-items:center;width:100%">
          <div style="width:52px;height:52px;background:var(--bg-success);color:var(--text-success);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:12px">
            <i class="ti ti-check"></i>
          </div>
          <div style="font-size:17px;font-weight:700;color:var(--text-primary);margin-bottom:4px">แปลงไฟล์สำเร็จสมบูรณ์!</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;word-break:break-all">
            บันทึกเป็น: <span style="font-weight:600;color:var(--text-primary)">${escapeHtml(destName)}</span>
          </div>
          <div id="cvFileSize" style="font-size:11.5px;color:var(--text-secondary);margin-bottom:16px"></div>

          <div style="display:flex;flex-direction:column;gap:8px;width:100%">
            <button id="cvDownload" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:11px 16px;background:var(--bg-accent);color:var(--text-accent);border:1px solid var(--border-accent);border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">
              <i class="ti ti-download"></i> ดาวน์โหลดไฟล์ผลลัพธ์ (${preset.targetFormat})
            </button>
            <button id="cvDone" style="padding:7px 16px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);border-radius:10px;font-size:12px;cursor:pointer">
              เสร็จสิ้น
            </button>
          </div>
        </div>

        <!-- สถานะผิดพลาด (Error State) -->
        <div id="cvError" style="display:none;flex-direction:column;align-items:center;width:100%">
          <div style="width:52px;height:52px;background:#fee2e2;color:#dc2626;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:12px">
            <i class="ti ti-alert-triangle"></i>
          </div>
          <div style="font-size:16px;font-weight:700;color:#dc2626;margin-bottom:4px">แปลงไฟล์ไม่สำเร็จ</div>
          <div id="cvErrorMsg" style="font-size:12px;color:var(--text-secondary);margin-bottom:16px"></div>
          <button id="cvErrClose" style="padding:8px 20px;background:var(--surface-1);border:1px solid var(--border-strong);border-radius:10px;font-size:12px;cursor:pointer">
            ปิด
          </button>
        </div>
      </div>
    `;

    $('fxed').append(overlay);
    activeDialog = overlay;

    const close = () => {
      overlay.remove();
      activeDialog = null;
    };

    $('cvDone').addEventListener('click', close);
    $('cvErrClose').addEventListener('click', close);
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });

    let readyBlob = null;

    // เริ่มต้นกระบวนการแปลงไฟล์จริงทันที
    (async () => {
      const pBar = $('cvPBar');
      try {
        if (pBar) pBar.style.width = '35%';
        const blob = await performConversion(destName, file, preset);
        readyBlob = blob;
        if (pBar) pBar.style.width = '100%';

        setTimeout(() => {
          const loading = $('cvLoading');
          const success = $('cvSuccess');
          const sizeEl = $('cvFileSize');
          if (loading && success) {
            loading.style.display = 'none';
            success.style.display = 'flex';
            if (sizeEl && blob) {
              sizeEl.textContent = `ขนาดไฟล์ผลลัพธ์: ${formatBytes(blob.size)}`;
            }
          }
        }, 250);
      } catch (err) {
        console.error('[Filee Engine Error]:', err);
        const loading = $('cvLoading');
        const errView = $('cvError');
        const errText = $('cvErrorMsg');
        if (loading && errView) {
          loading.style.display = 'none';
          errView.style.display = 'flex';
          if (errText) errText.textContent = err.message || 'เกิดข้อผิดพลาดในการประมวลผลไฟล์';
        }
      }
    })();

    $('cvDownload').addEventListener('click', () => {
      if (readyBlob) {
        blobDownload(readyBlob, destName);
        showStatus(`ดาวน์โหลด ${destName} เรียบร้อยแล้ว`);
      }
    });
  }

  function openPresetDialog(presetId) {
    if (dragState) cancelDrag();
    const profile = activeProfile();
    const preset = findPreset(profile, presetId);
    if (!preset || activeDialog) return;
    hoveredIndex = -1;
    pen.style.visibility = 'hidden';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:5';
    overlay.innerHTML = `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:14px 16px;width:380px;font-size:13px">
<div style="display:flex;align-items:center;gap:6px;font-weight:600;margin-bottom:10px"><i class="ti ti-pencil"></i>แก้ไขพรีเซ็ต<span style="margin-left:auto;font-size:11px;font-weight:400;color:var(--text-muted)">เครื่องมือแก้ไขแบบเดียวกับหน้าพรีเซ็ต</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
<label class="fxf" style="grid-column:1/3">ชื่อ<input id="fpN" value="${escapeHtml(preset.name)}" style="width:100%;box-sizing:border-box"><span id="fpE" style="font-size:12px;color:var(--text-danger)"></span></label>
<label class="fxf">รูปแบบไฟล์ปลายทาง${selectHtml('fpF', FORMATS, preset.targetFormat)}</label>
<label class="fxf">ขนาด${selectHtml('fpZ', SIZES, preset.size)}</label>
<label class="fxf" style="grid-column:1/3">คุณภาพ <span style="display:flex;gap:8px;align-items:center"><input type="range" id="fpQ" min="10" max="100" step="1" value="${preset.quality}" style="flex:1"><span id="fpQo" style="min-width:28px;color:var(--text-primary)">${preset.quality}</span></span></label>
<label class="fxf">ตำแหน่งบันทึก${selectHtml('fpL', LOCATIONS, preset.saveLocation)}</label>
<label class="fxf">เมื่อชื่อไฟล์ซ้ำ${selectHtml('fpC2', CONFLICTS, preset.conflictPolicy)}</label>
<label class="fxf" style="grid-column:1/3">รูปแบบชื่อไฟล์<input id="fpP" value="${escapeHtml(preset.fileNamePattern)}" style="width:100%;box-sizing:border-box"></label>
<label style="grid-column:1/3;font-size:12px;color:var(--text-secondary)"><input type="checkbox" id="fpX"${preset.keepExif ? ' checked' : ''}> เก็บข้อมูลเมตา (EXIF)</label>
</div>
<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button id="fpCa">ยกเลิก</button><button id="fpSv">บันทึก</button></div></div>`;
    $('fxed').append(overlay);
    activeDialog = overlay;
    const close = () => {
      overlay.remove();
      activeDialog = null;
      render(false);
    };
    overlay.addEventListener('pointerdown', event => {
      if (event.target === overlay) close();
    });
    $('fpCa').addEventListener('click', close);
    $('fpQ').addEventListener('input', event => { $('fpQo').textContent = event.target.value; });
    $('fpN').addEventListener('input', () => { $('fpE').textContent = ''; });
    $('fpSv').addEventListener('click', () => {
      const result = domain.updatePreset(profile, presetId, {
        name: $('fpN').value,
        targetFormat: $('fpF').value,
        size: $('fpZ').value,
        quality: Number($('fpQ').value),
        saveLocation: $('fpL').value,
        conflictPolicy: $('fpC2').value,
        fileNamePattern: $('fpP').value,
        keepExif: $('fpX').checked
      });
      if (!result.ok) {
        $('fpE').textContent = result.message || 'ค่าที่กรอกไม่ถูกต้อง';
        return;
      }
      close();
      scheduleSave();
    });
    $('fpN').focus();
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Enter' && event.target.id === 'fpN') {
        event.preventDefault();
        $('fpSv').click();
      }
    });
  }

  svg.addEventListener('pointerdown', event => {
    const segment = event.target.closest('[data-seg]');
    if (!segment) return;
    const index = Number(segment.dataset.seg);
    const preset = activeProfile().wheel[index];
    if (preset) beginDrag({ source: 'wheel', index, presetId: preset.id, presetName: preset.name }, event);
  });

  palette.addEventListener('pointerdown', event => {
    const chip = event.target.closest('[data-preset-id]');
    if (!chip) return;
    const preset = activeProfile().tray.find(item => item.id === chip.dataset.presetId);
    if (preset) beginDrag({ source: 'tray', presetId: preset.id, presetName: preset.name }, event);
  });

  svg.addEventListener('contextmenu', event => {
    event.preventDefault();
    if (activeDialog) return;
    const index = hitTestClient(event.clientX, event.clientY);
    if (index >= 0) {
      const preset = activeProfile().wheel[index];
      if (preset) openPresetDialog(preset.id);
    }
  });

  pen.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
  });
  pen.addEventListener('click', () => {
    const preset = activeProfile().wheel[hoveredIndex];
    if (preset) openPresetDialog(preset.id);
  });

  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', finishDrag);
  root.addEventListener('pointercancel', cancelDrag);
  root.addEventListener('lostpointercapture', () => {
    if (dragState) cancelDrag();
  });
  wheel.addEventListener('pointerleave', () => {
    if (!dragState && !activeDialog) setHovered(-1);
  });
  window.addEventListener('blur', cancelDrag);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelDrag();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dragState) cancelDrag();
  });

  // File drag & drop onto the donut / center
  ['dragenter', 'dragover'].forEach(name => {
    window.addEventListener(name, e => {
      e.preventDefault();
      const center = $('fxcenter');
      if (center) {
        center.style.background = 'var(--bg-success)';
        center.style.borderColor = 'var(--text-success)';
      }
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    window.addEventListener(name, e => {
      e.preventDefault();
      updateCenterDisplay();
    });
  });

  window.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // Clicking center to select file
  const centerEl = $('fxcenter');
  const fileInputEl = $('fxfileinput');
  if (centerEl && fileInputEl) {
    centerEl.addEventListener('click', () => fileInputEl.click());
    fileInputEl.addEventListener('change', e => {
      if (e.target.files && e.target.files.length) {
        handleFile(e.target.files[0]);
      }
    });
  }

  // Wheel rotation controls
  const rotLeft = $('fxrot-left');
  const rotRight = $('fxrot-right');
  if (rotLeft) rotLeft.addEventListener('click', () => setWheelRotation(wheelRotation - 30));
  if (rotRight) rotRight.addEventListener('click', () => setWheelRotation(wheelRotation + 30));

  wheel.addEventListener('wheel', e => {
    e.preventDefault();
    setWheelRotation(wheelRotation + (e.deltaY > 0 ? 15 : -15));
  }, { passive: false });

  $('fxadd').addEventListener('click', () => domain.addProfile());
  $('fxext').addEventListener('click', () => {
    const profile = activeProfile();
    const edited = prompt('ใส่นามสกุลไฟล์ คั่นแต่ละรายการด้วยจุลภาค', profile.extensions.join(', '));
    if (edited !== null) domain.setExtensions(profile.id, edited);
  });
  $('fxred').addEventListener('change', event => {
    root.classList.toggle('red', event.target.checked);
    scheduleSave();
    render(false);
  });
  window.addEventListener('pagehide', flushSave);
  window.addEventListener('beforeunload', flushSave);

  window.FileeToolbar = {
    state,
    operations: domain,
    hitTest,
    normalizeExtensions,
    profileForExtension,
    presetsForFile: extension => profileForExtension(extension)?.wheel || [],
    flushSave,
    getCurrentProfile: activeProfile,
    getHoveredIndex: () => hoveredIndex,
    getDragPhase: () => dragState?.phase || 'idle'
  };

  render(true);
})();
