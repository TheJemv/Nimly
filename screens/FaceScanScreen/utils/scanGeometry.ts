import type { FaceUpdate } from '@/modules/face-scan';

export const TICK_COUNT = 60;

// Vision head pose → screen directions. The feed is mirrored like a selfie,
// so turning toward your right lights the right side of the ring.
// Flip a sign if a side lights up opposite to where the head turns.
const YAW_SIGN = 1;
const PITCH_SIGN = 1;

// How far the head has to turn for a direction to count (radians).
const YAW_REACH = 0.3; // ~17°
const PITCH_REACH = 0.2; // ~11°

// Ticks lit on each side of the one the head points at.
const TICK_SPREAD = 2;

export type Oval = { cx: number; cy: number; rx: number; ry: number };

export type Fit = 'none' | 'off-center' | 'too-far' | 'too-close' | 'turned' | 'ok';

export type Side = 'up' | 'down' | 'left' | 'right';

// Strict before the scan starts (centered, right distance, facing forward);
// loose while scanning, since turning the head shifts and shrinks the box.
const LIMITS = {
    strict: { offCenter: 0.28, minSize: 0.5, maxSize: 0.95, maxAngle: 0.3 },
    loose: { offCenter: 0.55, minSize: 0.35, maxSize: 1.15, maxAngle: Infinity },
};

export function ovalFit(face: FaceUpdate, oval: Oval, mode: keyof typeof LIMITS): Fit {
    if (!face.hasFace) return 'none';
    const limits = LIMITS[mode];

    const dx = (face.x + face.width / 2 - oval.cx) / oval.rx;
    const dy = (face.y + face.height / 2 - oval.cy) / oval.ry;
    if (Math.hypot(dx, dy) > limits.offCenter) return 'off-center';

    const size = face.width / (oval.rx * 2);
    if (size < limits.minSize) return 'too-far';
    if (size > limits.maxSize) return 'too-close';

    if (Math.abs(face.yaw) > limits.maxAngle || Math.abs(face.pitch) > limits.maxAngle) return 'turned';
    return 'ok';
}

// Tick i's angle in screen space (0 = right, clockwise), starting at the top.
export const tickAngle = (i: number) => (i / TICK_COUNT) * 2 * Math.PI - Math.PI / 2;

// Screen-space angle the head is turned toward, or null while it's still
// roughly facing forward.
export function headDirection(yaw: number, pitch: number): number | null {
    const x = (YAW_SIGN * yaw) / YAW_REACH;
    const y = (PITCH_SIGN * pitch) / PITCH_REACH;
    if (Math.hypot(x, y) < 1) return null;
    return Math.atan2(y, x);
}

export function ticksAt(angle: number): number[] {
    const center = Math.round((angle + Math.PI / 2) / ((2 * Math.PI) / TICK_COUNT));
    const ticks: number[] = [];
    for (let d = -TICK_SPREAD; d <= TICK_SPREAD; d++) {
        ticks.push((((center + d) % TICK_COUNT) + TICK_COUNT) % TICK_COUNT);
    }
    return ticks;
}

const SIDES: Side[] = ['right', 'down', 'left', 'up'];

// The side with the most ticks still missing: where to tell the user to turn next.
export function mostMissingSide(lit: boolean[]): Side | null {
    const missing = [0, 0, 0, 0];
    lit.forEach((on, i) => {
        if (on) return;
        const angle = (tickAngle(i) + 2 * Math.PI) % (2 * Math.PI);
        missing[Math.round(angle / (Math.PI / 2)) % 4]++;
    });
    const most = Math.max(...missing);
    return most === 0 ? null : SIDES[missing.indexOf(most)];
}
