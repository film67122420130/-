using System;

namespace Filee.Core.Geometry;

public static class DonutGeometry
{
    public const double ReferenceSize = 320.0;
    public const double OuterRadiusRatio = 152.0 / ReferenceSize; // ~0.475
    public const double InnerRadiusRatio = 62.0 / ReferenceSize;  // ~0.19375
    public const double HoverThresholdRatio = 10.0 / ReferenceSize; // ระยะเผื่อ hover เลื่อนออก

    public static int HitTestSegment(double x, double y, double size, int segmentCount, double rotationDegrees = 0.0)
    {
        if (segmentCount <= 0) return -1;
        if (size <= 0) return -1;

        double center = size / 2.0;
        double r1 = size * InnerRadiusRatio;
        double r2 = size * (OuterRadiusRatio + HoverThresholdRatio);

        double dx = x - center;
        double dy = y - center;
        double distance = Math.Sqrt(dx * dx + dy * dy);

        if (distance < r1 || distance > r2)
            return -1;

        if (segmentCount == 1)
            return 0;

        double angleDeg = CalculateAngle(dx, dy);
        double effectiveAngle = (angleDeg - rotationDegrees % 360.0 + 720.0) % 360.0;
        return CalculateIndexFromAngle(effectiveAngle, segmentCount);
    }

    public static double CalculateAngle(double dx, double dy)
    {
        // แกนบนสุด (12 นาฬิกา: dx=0, dy < 0) ให้ได้ 0 องศา, ตามเข็มนาฬิกาเป็นบวก
        // Math.Atan2(dx, -dy):
        // dx=0, dy=-1 -> Atan2(0, 1) = 0
        // dx=1, dy=0  -> Atan2(1, 0) = PI/2 (90 องศา)
        // dx=0, dy=1  -> Atan2(0, -1) = PI (180 องศา)
        // dx=-1, dy=0 -> Atan2(-1, 0) = -PI/2 (270 องศา)
        double rad = Math.Atan2(dx, -dy);
        double deg = rad * (180.0 / Math.PI);
        if (deg < 0) deg += 360.0;
        return deg;
    }

    public static int CalculateIndexFromAngle(double angleDeg, int segmentCount)
    {
        if (segmentCount <= 0) return -1;
        if (segmentCount == 1) return 0;

        double step = 360.0 / segmentCount;
        int index = (int)Math.Floor(((angleDeg + (step / 2.0)) % 360.0) / step);

        return Math.Clamp(index, 0, segmentCount - 1);
    }

    public static (double X, double Y) GetPencilPosition(double size, int segmentIndex, int segmentCount)
    {
        double center = size / 2.0;
        if (segmentCount <= 0 || segmentIndex < 0) return (center, center);

        if (segmentCount == 1)
        {
            return (center, center - (size * (138.0 / ReferenceSize)));
        }

        double r = size * (140.0 / ReferenceSize);
        // มุมคณิตศาสตร์มาตรฐาน (เริ่มที่ 3 นาฬิกา หมุนทวนเข็ม) ที่ mockup ใช้:
        // m = -Math.PI/2 + i * 2 * Math.PI / n
        double m = -Math.PI / 2.0 + (segmentIndex * 2.0 * Math.PI / segmentCount);
        double px = center + (r * Math.Cos(m));
        double py = center + (r * Math.Sin(m));
        return (px, py);
    }
}
