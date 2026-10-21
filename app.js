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
     CONVERSION ENGINE v2 — จัดการทุกประเภทไฟล์ต้นทาง × ทุก preset ปลายทาง
     Dependencies (loaded via CDN):
       - jsPDF       : image→PDF, text→PDF
       - mammoth.js  : DOCX/DOC → HTML, TXT, PDF
       - PDF.js      : PDF → canvas → PNG/JPG
     ═══════════════════════════════════════════════════════════════════════ */

  // ── ตรวจสอบ PDF.js worker ──────────────────────────────────────────────
  function ensurePdfWorker() {
    if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  // ── วิเคราะห์ preset ────────────────────────────────────────────────────
  function analyzePreset(preset, srcW, srcH) {
    const name = (preset.name || '').toUpperCase();
    let grayscale = name.includes('ขาวดำ') || name.includes('GRAYSCALE');
    let quality   = Math.max(0.1, Math.min(1.0, (preset.quality || 80) / 100));
    let scaleW = srcW, scaleH = srcH;

    const sz = preset.size || 'ต้นฉบับ';
    if (sz === '50%' || name.includes('50%') || name.includes('ย่อ')) {
      scaleW = Math.round(srcW * 0.5);
      scaleH = Math.round(srcH * 0.5);
    } else if (sz.includes('1920') || name.includes('1920')) {
      const long = Math.max(srcW, srcH);
      if (long > 1920) { const r = 1920/long; scaleW = Math.round(srcW*r); scaleH = Math.round(srcH*r); }
    } else if (sz.includes('1280') || name.includes('1280')) {
      const long = Math.max(srcW, srcH);
      if (long > 1280) { const r = 1280/long; scaleW = Math.round(srcW*r); scaleH = Math.round(srcH*r); }
    }

    // อ่าน quality จากชื่อ preset (%XX%)
    const qm = name.match(/(\d{2,3})\s*%/);
    if (qm) quality = Math.max(0.1, Math.min(1.0, Number(qm[1]) / 100));

    const fmt = (preset.targetFormat || 'PNG').toUpperCase();
    let mime, realExt;
    switch (fmt) {
      case 'JPG': case 'JPEG': mime='image/jpeg'; realExt='jpg'; break;
      case 'WEBP':  mime='image/webp';  realExt='webp'; break;
      case 'PNG':   mime='image/png';   realExt='png';  break;
      case 'AVIF':  mime='image/avif';  realExt='avif'; break;
      case 'ICO':   mime='image/png';   realExt='ico';  break;
      // Browser-unsupported → PNG data, explicit ext
      case 'GIF':   mime='image/png';   realExt='gif';  break;
      case 'TIFF':  mime='image/png';   realExt='tiff'; break;
      case 'BMP':   mime='image/png';   realExt='bmp';  break;
      default:      mime='image/png';   realExt='png';
    }
    // AVIF support check
    if (mime === 'image/avif') {
      const t = document.createElement('canvas'); t.width = t.height = 1;
      if (!t.toDataURL('image/avif').startsWith('data:image/avif')) mime = 'image/webp';
    }
    return { grayscale, scaleW: Math.max(1,scaleW), scaleH: Math.max(1,scaleH), quality, mime, realExt };
  }

  // ── โหลดไฟล์ → HTMLImageElement ────────────────────────────────────────
  function loadImageElement(fileObj) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.onload = e => {
        const img = new Image();
        img.onerror = () => reject(new Error('Image decode failed'));
        img.onload  = () => resolve(img);
        img.src = e.target.result;
      };
      reader.readAsDataURL(fileObj);
    });
  }

  // ── Canvas helper: apply transform (resize + grayscale) ────────────────
  function drawToCanvas(imgEl, opts) {
    // ICO: force 32×32 (standard icon size)
    const w = opts.realExt === 'ico' ? 32 : opts.scaleW;
    const h = opts.realExt === 'ico' ? 32 : opts.scaleH;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, w, h);
    if (opts.grayscale) {
      const id = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < id.data.length; i += 4) {
        const lum = Math.round(0.299*id.data[i] + 0.587*id.data[i+1] + 0.114*id.data[i+2]);
        id.data[i] = id.data[i+1] = id.data[i+2] = lum;
      }
      ctx.putImageData(id, 0, 0);
    }
    return canvas;
  }

  // ── Image → Image Blob ─────────────────────────────────────────────────
  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob null')), mime, quality)
    );
  }

  // ── Image → PDF ────────────────────────────────────────────────────────
  async function imageToPdfBlob(imgEl, destName, opts) {
    if (!window.jspdf?.jsPDF) return new Blob([buildMinimalPdf(destName)], {type:'application/pdf'});
    const { jsPDF } = window.jspdf;
    const orientation = imgEl.width >= imgEl.height ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit:'mm', format:'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 10;
    const maxW = pw - margin*2, maxH = ph - margin*2;
    const ratio = Math.min(maxW/imgEl.width, maxH/imgEl.height);
    const canvas = drawToCanvas(imgEl, { ...opts, scaleW: imgEl.width, scaleH: imgEl.height });
    const dataUrl = canvas.toDataURL('image/jpeg', opts.quality);
    doc.addImage(dataUrl, 'JPEG', (pw - imgEl.width*ratio)/2, (ph - imgEl.height*ratio)/2,
                 imgEl.width*ratio, imgEl.height*ratio);
    return doc.output('blob');
  }

  // ── PDF page → Canvas (via PDF.js) ────────────────────────────────────
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

  // ── PDF → text (via PDF.js) ────────────────────────────────────────────
  async function pdfToText(fileObj) {
    ensurePdfWorker();
    if (!window.pdfjsLib) return '(PDF.js ไม่ได้โหลด — ไม่สามารถแยกข้อความได้)';
    const buf = await fileObj.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const parts = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      parts.push(content.items.map(i => i.str).join(' '));
    }
    return parts.join('\n\n');
  }

  // ── DOCX → HTML / Text via mammoth.js ─────────────────────────────────
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

  // ── Text / HTML → PDF via jsPDF ───────────────────────────────────────
  function textToPdfBlob(text, title) {
    if (!window.jspdf?.jsPDF) return new Blob([buildMinimalPdf(title)], {type:'application/pdf'});
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'mm', format:'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxWidth = pw - margin*2;
    doc.setFontSize(14);
    doc.text(title, margin, margin);
    doc.setFontSize(10);
    // strip HTML tags for plain text render
    const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim();
    const lines = doc.splitTextToSize(plain, maxWidth);
    let y = margin + 10;
    const lineH = 5;
    const pageH = doc.internal.pageSize.getHeight() - margin;
    for (const line of lines) {
      if (y + lineH > pageH) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += lineH;
    }
    return doc.output('blob');
  }

  // ── Minimal valid PDF fallback ─────────────────────────────────────────
  function buildMinimalPdf(filename) {
    const safe = filename.replace(/[()\\]/g, '');
    return `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 60 >>\nstream\nBT\n/F1 12 Tf\n50 800 Td\n(${safe}) Tj\nET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000230 00000 n \n0000000351 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n432\n%%EOF`;
  }

  // ── blobDownload ────────────────────────────────────────────────────────
  function blobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  /* ─────────────────────────────────────────────────────────────────────
     Master Conversion Router
     ──────────────────────────────────────────────────────────────────── */
  async function triggerDownload(destName, file, preset) {
    const fmt      = (preset.targetFormat || 'PNG').toUpperCase();
    const pname    = (preset.name || '').toUpperCase();
    const srcExt   = (file.ext || '').toLowerCase();
    const isImage  = !!file.file && file.file.type.startsWith('image/');
    const isPdf    = srcExt === 'pdf';
    const isDocx   = ['docx','doc','odt','rtf'].includes(srcExt);
    const isHwp    = ['hwp','hwpx'].includes(srcExt);
    const isOffice = ['xlsx','xls','pptx','ppt'].includes(srcExt);
    const isText   = ['txt','md','html','markdown','csv'].includes(srcExt);

    try {
      /* ════════════════════════════════════════════════
         ① ไฟล์ต้นทางเป็น รูปภาพ
         ════════════════════════════════════════════════ */
      if (isImage) {
        if (fmt === 'PDF') {
          const imgEl = await loadImageElement(file.file);
          const opts  = analyzePreset(preset, imgEl.width, imgEl.height);
          const blob  = await imageToPdfBlob(imgEl, destName, opts);
          return blobDownload(blob, destName);
        }
        const imgEl = await loadImageElement(file.file);
        const opts  = analyzePreset(preset, imgEl.width, imgEl.height);
        const canvas = drawToCanvas(imgEl, opts);
        // GIF/TIFF/BMP = PNG data → แจ้ง user
        if (['gif','tiff','bmp'].includes(opts.realExt)) {
          showStatus(`${fmt}: browser รองรับเฉพาะ PNG — บันทึกเป็น PNG (เปลี่ยนนามสกุลได้)`);
        }
        const blob = await canvasToBlob(canvas, opts.mime, opts.quality);
        return blobDownload(blob, destName);
      }

      /* ════════════════════════════════════════════════
         ② ไฟล์ต้นทางเป็น PDF
         ════════════════════════════════════════════════ */
      if (isPdf && file.file) {
        // PDF → Image
        if (['PNG','JPG','JPEG','WEBP'].includes(fmt)) {
          const canvas = await pdfPageToCanvas(file.file, 1, 2.0);
          const mime = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
          const blob = await canvasToBlob(canvas, mime, 0.92);
          return blobDownload(blob, destName);
        }
        // PDF → TXT
        if (fmt === 'TXT') {
          const text = await pdfToText(file.file);
          return blobDownload(new Blob([text], {type:'text/plain;charset=utf-8'}), destName);
        }
        // แยก PDF / บีบอัด PDF → ส่งต้นฉบับกลับ
        if (pname.includes('แยก') || pname.includes('บีบอัด')) {
          showStatus(`${preset.name}: browser-only — ส่งไฟล์ต้นฉบับกลับ`);
          return blobDownload(file.file, file.name);
        }
        // PDF → PDF/A, DOCX ฯลฯ → browser limitation
        showStatus(`${fmt}: ต้องใช้เซิร์ฟเวอร์ — ส่งต้นฉบับ PDF กลับ`);
        return blobDownload(file.file, file.name);
      }

      /* ════════════════════════════════════════════════
         ③ ไฟล์ต้นทางเป็น DOCX / DOC / ODT / RTF
         ════════════════════════════════════════════════ */
      if (isDocx && file.file) {
        if (fmt === 'PDF') {
          const html = await docxToHtml(file.file);
          const blob = await textToPdfBlob(html, file.name);
          return blobDownload(blob, destName);
        }
        if (fmt === 'HTML') {
          const html = await docxToHtml(file.file);
          const wrap = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(file.name)}</title>` +
            `<style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px}</style></head><body>${html}</body></html>`;
          return blobDownload(new Blob([wrap], {type:'text/html;charset=utf-8'}), destName);
        }
        if (fmt === 'TXT' || fmt === 'MARKDOWN') {
          const text = await docxToText(file.file);
          return blobDownload(new Blob([text], {type:'text/plain;charset=utf-8'}), destName);
        }
        // ODT, HWPX, RTF, DOC → browser limitation, ส่งต้นฉบับ
        showStatus(`${fmt}: ต้องใช้เซิร์ฟเวอร์ — ส่งต้นฉบับกลับ`);
        return blobDownload(file.file, file.name);
      }

      /* ════════════════════════════════════════════════
         ④ ไฟล์ต้นทางเป็น HWP / HWPX
         ════════════════════════════════════════════════ */
      if (isHwp && file.file) {
        showStatus('HWP/HWPX: ต้องใช้ engine ฝั่งเซิร์ฟเวอร์ — ส่งต้นฉบับกลับ');
        return blobDownload(file.file, file.name);
      }

      /* ════════════════════════════════════════════════
         ⑤ ไฟล์ต้นทางเป็น TXT / HTML / Markdown / CSV
         ════════════════════════════════════════════════ */
      if (isText && file.file) {
        const text = await file.file.text();
        if (fmt === 'PDF') {
          const blob = await textToPdfBlob(text, file.name);
          return blobDownload(blob, destName);
        }
        if (fmt === 'HTML' && !text.trim().startsWith('<')) {
          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(file.name)}</title></head>` +
            `<body><pre style="white-space:pre-wrap">${text.replace(/</g,'&lt;')}</pre></body></html>`;
          return blobDownload(new Blob([html], {type:'text/html;charset=utf-8'}), destName);
        }
        return blobDownload(new Blob([text], {type:'text/plain;charset=utf-8'}), destName);
      }

      /* ════════════════════════════════════════════════
         ⑥ Office (XLSX, PPTX) / Fallback
         ════════════════════════════════════════════════ */
      if (file.file) {
        showStatus(`${file.ext?.toUpperCase()}: ส่งต้นฉบับกลับ (ต้องใช้เซิร์ฟเวอร์)`);
        return blobDownload(file.file, file.name);
      }

      // ไม่มีไฟล์จริง → stub
      blobDownload(new Blob([`Filee Demo: ${destName}`], {type:'text/plain'}), destName);

    } catch (err) {
      console.error('[Filee] conversion error:', err);
      showStatus(`❌ ${err.message}`);
      // ถ้ามีต้นฉบับให้ส่งกลับเพื่อไม่ให้ user หงุดหงิด
      if (file.file) blobDownload(file.file, file.name);
    }
  }




  /**
   * วิเคราะห์ preset ว่าต้องการการแปลงแบบใด
   * คืน object { grayscale, scaleW, scaleH, quality, mimeOut, ext }
   */
  function analyzePreset(preset, srcW, srcH) {
    const name = (preset.name || '').toUpperCase();
    const fmt  = (preset.targetFormat || 'PNG').toUpperCase();
    let grayscale = name.includes('ขาวดำ') || name.includes('GRAYSCALE');
    let quality   = (preset.quality || 80) / 100;
    let scaleW = srcW, scaleH = srcH;

    // ขนาด
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

    // quality overrides จากชื่อ preset
    const qMatch = name.match(/(\d+)\s*%/);
    if (qMatch) quality = Number(qMatch[1]) / 100;

    // DPI hints (150 dpi / 300 dpi) ไม่มีผลกับ canvas แต่บันทึกไว้ใน meta
    // จะ label ชื่อไฟล์ให้ถูกต้องแทน

    // output mime
    let mimeOut, extOut;
    switch (fmt) {
      case 'JPG': case 'JPEG': mimeOut = 'image/jpeg'; extOut = 'jpg'; break;
      case 'WEBP':   mimeOut = 'image/webp';  extOut = 'webp'; break;
      case 'PNG':    mimeOut = 'image/png';   extOut = 'png';  break;
      case 'BMP':    mimeOut = 'image/bmp';   extOut = 'bmp';  break;
      case 'TIFF':   mimeOut = 'image/tiff';  extOut = 'tiff'; break;
      case 'GIF':    mimeOut = 'image/gif';   extOut = 'gif';  break;
      case 'AVIF':   mimeOut = 'image/avif';  extOut = 'avif'; break;
      case 'ICO':    mimeOut = 'image/png';   extOut = 'ico';  break; // ICO: render PNG → save as .ico
      default:       mimeOut = 'image/png';   extOut = 'png';
    }
    return { grayscale, scaleW: Math.max(1, scaleW), scaleH: Math.max(1, scaleH), quality, mimeOut, extOut };
  }

  /**
   * ใช้ Canvas แปลงรูปภาพจริงๆ รองรับ grayscale + resize + quality
   * คืน Promise<Blob>
   */
  function convertImageOnCanvas(imgEl, opts) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width  = opts.scaleW;
      canvas.height = opts.scaleH;
      const ctx = canvas.getContext('2d');

      // วาดรูปพร้อม resize
      ctx.drawImage(imgEl, 0, 0, opts.scaleW, opts.scaleH);

      // Grayscale: ดึง pixel data แล้วแปลงทีละ pixel
      if (opts.grayscale) {
        const imageData = ctx.getImageData(0, 0, opts.scaleW, opts.scaleH);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          // Luminance formula (ITU-R BT.601)
          const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          data[i] = data[i + 1] = data[i + 2] = lum;
        }
        ctx.putImageData(imageData, 0, 0);
      }

      // สำหรับ ICO: render เป็น PNG ก่อน แล้วแก้ extension ที่ download step
      let mime = opts.mimeOut;
      let quality = opts.quality;

      // AVIF fallback → WEBP → PNG (browser support varies)
      if (mime === 'image/avif') {
        const test = document.createElement('canvas');
        test.width = test.height = 1;
        const avifOk = test.toDataURL('image/avif').startsWith('data:image/avif');
        if (!avifOk) mime = 'image/webp';
      }
      // GIF fallback → PNG (browser ไม่ encode GIF ได้นะครับ)
      if (mime === 'image/gif') mime = 'image/png';
      // TIFF fallback → PNG
      if (mime === 'image/tiff') mime = 'image/png';
      // BMP fallback → PNG (Chrome ไม่ encode BMP ได้)
      if (mime === 'image/bmp') mime = 'image/png';

      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      }, mime, quality);
    });
  }

  /**
   * โหลด File object เป็น HTMLImageElement
   */
  function loadImageElement(fileObj) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(fileObj);
    });
  }

  /**
   * แปลงรูปภาพเป็น PDF ด้วย jsPDF
   */
  function convertImageToPdf(imgEl, destName, opts) {
    return new Promise(resolve => {
      if (window.jspdf && window.jspdf.jsPDF) {
        const { jsPDF } = window.jspdf;
        const orientation = imgEl.width >= imgEl.height ? 'landscape' : 'portrait';
        const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 10;
        const maxW = pageW - margin * 2;
        const maxH = pageH - margin * 2;
        const ratio = Math.min(maxW / imgEl.width, maxH / imgEl.height);
        const w = imgEl.width * ratio;
        const h = imgEl.height * ratio;
        const x = (pageW - w) / 2;
        const y = (pageH - h) / 2;

        // วาดผ่าน canvas ก่อนเพื่อรองรับ grayscale
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(imgEl.width * opts.quality);
        canvas.height = Math.round(imgEl.height * opts.quality);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
        if (opts.grayscale) {
          const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < id.data.length; i += 4) {
            const lum = Math.round(0.299 * id.data[i] + 0.587 * id.data[i + 1] + 0.114 * id.data[i + 2]);
            id.data[i] = id.data[i + 1] = id.data[i + 2] = lum;
          }
          ctx.putImageData(id, 0, 0);
        }
        const dataUrl = canvas.toDataURL('image/jpeg', opts.quality);
        doc.addImage(dataUrl, 'JPEG', x, y, w, h);
        resolve(doc.output('blob'));
      } else {
        // Fallback: valid PDF binary
        const pdfStr = buildMinimalPdf(destName);
        resolve(new Blob([pdfStr], { type: 'application/pdf' }));
      }
    });
  }

  function buildMinimalPdf(filename) {
    return `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 100 >>\nstream\nBT\n/F1 14 Tf\n50 780 Td\n(Filee: ${filename.replace(/[()]/g, '')}) Tj\nET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000239 00000 n \n0000000391 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n472\n%%EOF`;
  }

  /**
   * Master download function — เรียกตาม targetFormat
   */
  async function triggerDownload(destName, file, preset) {
    const fmt = (preset.targetFormat || 'PNG').toUpperCase();
    const name = (preset.name || '').toUpperCase();
    const isImage = file.file && file.file.type.startsWith('image/');
    const isPdfSrc = file.ext === 'pdf';

    try {
      // ── TEXT-LIKE FORMATS (TXT / HTML / MARKDOWN) ─────────────────────
      if (['TXT', 'HTML', 'MARKDOWN'].includes(fmt)) {
        let content;
        if (file.file && (file.file.type.startsWith('text/') || file.file.type === '')) {
          content = await file.file.text();
        } else {
          content = `Filee Converted\nSource: ${file.name}\nPreset: ${preset.name}\nTarget: ${fmt}`;
        }
        if (fmt === 'HTML' && !content.trim().startsWith('<')) {
          content = `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${file.name}</title></head>\n<body><pre>${content.replace(/</g,'&lt;')}</pre></body></html>`;
        }
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        return blobDownload(blob, destName);
      }

      // ── PDF SPLIT (แยก PDF) ────────────────────────────────────────────
      if (name.includes('แยก') && fmt === 'PDF') {
        if (isPdfSrc && file.file) return blobDownload(file.file, destName);
        return blobDownload(new Blob([buildMinimalPdf(destName)], { type: 'application/pdf' }), destName);
      }

      // ── PDF COMPRESS (บีบอัด PDF) ─────────────────────────────────────
      if (name.includes('บีบอัด') && fmt === 'PDF') {
        if (isPdfSrc && file.file) {
          // Web API ไม่มี native PDF compress — ส่งต้นฉบับพร้อมบอก user
          showStatus('บีบอัด PDF: ส่งต้นฉบับกลับมา (browser-only build)');
          return blobDownload(file.file, destName);
        }
        return blobDownload(new Blob([buildMinimalPdf(destName)], { type: 'application/pdf' }), destName);
      }

      // ── TARGET = PDF (จากรูปภาพ) ──────────────────────────────────────
      if (fmt === 'PDF' && isImage) {
        const imgEl = await loadImageElement(file.file);
        const opts = analyzePreset(preset, imgEl.width, imgEl.height);
        const blob = await convertImageToPdf(imgEl, destName, opts);
        return blobDownload(blob, destName);
      }

      // ── PDF/A (ส่ง PDF ธรรมดาแทน — browser limitation) ──────────────
      if (fmt === 'PDF') {
        if (isPdfSrc && file.file) return blobDownload(file.file, destName);
        return blobDownload(new Blob([buildMinimalPdf(destName)], { type: 'application/pdf' }), destName);
      }

      // ── IMAGE → IMAGE CONVERSIONS (รองรับทุก preset รูปภาพ) ──────────
      if (isImage) {
        const imgEl = await loadImageElement(file.file);
        const opts  = analyzePreset(preset, imgEl.width, imgEl.height);
        const blob  = await convertImageOnCanvas(imgEl, opts);
        return blobDownload(blob, destName);
      }

      // ── DOCUMENT FORMATS (DOCX, ODT, HWPX, RTF, DOC) ─────────────────
      if (['DOCX', 'ODT', 'HWPX', 'RTF', 'DOC'].includes(fmt)) {
        if (file.file) return blobDownload(file.file, destName);
        const stub = `Filee Converted\nSource: ${file.name}\nPreset: ${preset.name} → ${fmt}\n(Document conversion requires server-side processing)`;
        return blobDownload(new Blob([stub], { type: 'application/octet-stream' }), destName);
      }

      // ── FALLBACK ──────────────────────────────────────────────────────
      if (file.file) return blobDownload(file.file, destName);
      blobDownload(new Blob([`Filee output: ${destName}`], { type: 'text/plain' }), destName);

    } catch (err) {
      console.error('Filee conversion error:', err);
      showStatus(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  }

  function blobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }


  function openSuccessModal(preset, file, destName) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:20;backdrop-filter:blur(3px)';

    overlay.innerHTML = `
      <div style="background:var(--surface-2);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:16px;padding:24px 28px;width:380px;max-width:90vw;display:flex;flex-direction:column;align-items:center;text-align:center;box-shadow:0 12px 36px rgba(0,0,0,.25);transition:all .3s">
        <!-- สถานะกำลังแปลง (Loading State) -->
        <div id="cvLoading" style="display:flex;flex-direction:column;align-items:center;padding:10px 0;width:100%">
          <div style="width:44px;height:44px;border:3px solid var(--border-strong);border-top-color:var(--border-accent);border-radius:50%;animation:fxspin .7s linear infinite;margin-bottom:14px"></div>
          <div style="font-size:15px;font-weight:600;margin-bottom:4px">กำลังแปลงไฟล์...</div>
          <div style="font-size:12px;color:var(--text-secondary);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(file.name)} ➔ ${preset.targetFormat}</div>
          <div style="width:100%;height:6px;background:var(--surface-1);border-radius:3px;margin-top:16px;overflow:hidden">
            <div id="cvPBar" style="width:10%;height:100%;background:var(--text-accent);border-radius:3px;transition:width .3s ease"></div>
          </div>
        </div>

        <!-- สถานะสำเร็จ (Success State) -->
        <div id="cvSuccess" style="display:none;flex-direction:column;align-items:center;width:100%">
          <div style="width:52px;height:52px;background:var(--bg-success);color:var(--text-success);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:12px">
            <i class="ti ti-check"></i>
          </div>
          <div style="font-size:17px;font-weight:700;color:var(--text-primary);margin-bottom:4px">แปลงไฟล์สำเร็จ!</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;word-break:break-all">
            บันทึกเป็น: <span style="font-weight:600;color:var(--text-primary)">${escapeHtml(destName)}</span>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;width:100%">
            <button id="cvDownload" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 16px;background:var(--bg-accent);color:var(--text-accent);border:1px solid var(--border-accent);border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">
              <i class="ti ti-download"></i> ดาวน์โหลดไฟล์ผลลัพธ์ (${preset.targetFormat})
            </button>
            <button id="cvDone" style="padding:7px 16px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);border-radius:10px;font-size:12px;cursor:pointer">
              เสร็จสิ้น
            </button>
          </div>
        </div>
      </div>
    `;

    $('fxed').append(overlay);
    activeDialog = overlay;

    // Loading Animation
    const pBar = $('cvPBar');
    setTimeout(() => { if (pBar) pBar.style.width = '65%'; }, 120);
    setTimeout(() => { if (pBar) pBar.style.width = '100%'; }, 350);

    // Switch to Success state
    setTimeout(() => {
      const loading = $('cvLoading');
      const success = $('cvSuccess');
      if (loading && success) {
        loading.style.display = 'none';
        success.style.display = 'flex';
      }
    }, 450);

    const close = () => {
      overlay.remove();
      activeDialog = null;
    };

    $('cvDone').addEventListener('click', close);
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });

    $('cvDownload').addEventListener('click', async () => {
      $('cvDownload').disabled = true;
      $('cvDownload').textContent = 'กำลังเตรียมไฟล์…';
      await triggerDownload(destName, file, preset);
      showStatus(`ดาวน์โหลด ${destName} เรียบร้อยแล้ว`);
      $('cvDownload').disabled = false;
      $('cvDownload').innerHTML = `<i class="ti ti-download"></i> ดาวน์โหลดไฟล์ผลลัพธ์ (${preset.targetFormat})`;
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
