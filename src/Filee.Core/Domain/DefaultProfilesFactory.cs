using System.Collections.Generic;
using System.Linq;
using Filee.Core.Models;

namespace Filee.Core.Domain;

public static class DefaultProfilesFactory
{
    public const string DefaultSelectedProfileId = "image";

    public static List<Profile> CreateDefaults()
    {
        return new List<Profile>
        {
            CreateProfile(
                id: "image",
                name: "รูปภาพ",
                extensions: new[] { "jpg", "jpeg", "png", "bmp", "tiff", "webp", "gif", "heic" },
                wheelNames: new[] { "PNG", "WEBP", "PDF", "TIFF", "BMP", "ICO", "JPG 70%", "ย่อ 50%" },
                trayNames: new[] { "GIF", "AVIF", "PNG ขาวดำ", "TIFF 300 dpi" }
            ),
            CreateProfile(
                id: "pdf",
                name: "PDF",
                extensions: new[] { "pdf" },
                wheelNames: new[] { "PNG", "JPG", "DOCX", "HWPX", "TXT", "แยก PDF", "บีบอัด PDF" },
                trayNames: new[] { "TIFF", "PDF/A", "JPG 150 dpi" }
            ),
            CreateProfile(
                id: "office",
                name: "เอกสารสำนักงาน",
                extensions: new[] { "docx", "doc", "odt", "rtf", "xlsx", "pptx" },
                wheelNames: new[] { "PDF", "ODT", "HWPX", "TXT", "HTML" },
                trayNames: new[] { "RTF", "DOC", "PDF/A" }
            ),
            CreateProfile(
                id: "hwp",
                name: "HWP/HWPX",
                extensions: new[] { "hwp", "hwpx" },
                wheelNames: new[] { "PDF", "DOCX", "PNG", "TXT", "HWPX" },
                trayNames: new[] { "ODT", "HTML", "Markdown" }
            )
        };
    }

    private static Profile CreateProfile(string id, string name, IEnumerable<string> extensions, IEnumerable<string> wheelNames, IEnumerable<string> trayNames)
    {
        var profile = new Profile
        {
            Id = id,
            Name = name,
            Extensions = Profile.NormalizeExtensions(extensions)
        };

        foreach (var wName in wheelNames)
        {
            profile.Wheel.Add(Preset.Create(wName));
        }

        foreach (var tName in trayNames)
        {
            profile.Tray.Add(Preset.Create(tName));
        }

        return profile;
    }
}
