import { memo, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Ellipse, Line, Path } from 'react-native-svg';

import { getThemeColor } from '@/constants/theme';
import { Oval, tickAngle } from '../utils/scanGeometry';

const AnimatedLine = Animated.createAnimatedComponent(Line);

const TICK_GAP = 12; // between the oval and the ticks
const TICK_LENGTH = 9;
const TICK_LIT_LENGTH = 18;
const TICK_WIDTH = 3;

type ScanRingProps = {
    width: number;
    height: number;
    oval: Oval;
    lit: boolean[];
    active: boolean;
};

// Black everywhere except the oval (the camera shows through the hole), with
// Face ID-style ticks around it that light up as the head turns toward them.
export default function ScanRing({ width, height, oval, lit, active }: ScanRingProps) {
    const { cx, cy, rx, ry } = oval;
    const mask =
        `M0 0H${width}V${height}H0Z ` +
        `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;

    return (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path d={mask} fill="#000" fillRule="evenodd" />
            <Ellipse
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                fill="none"
                stroke={active ? getThemeColor('success') : 'rgba(255,255,255,0.15)'}
                strokeWidth={2}
            />
            {lit.map((on, i) => (
                <Tick key={i} index={i} oval={oval} lit={on} />
            ))}
        </Svg>
    );
}

const Tick = memo(function Tick({ index, oval, lit }: { index: number; oval: Oval; lit: boolean }) {
    const angle = tickAngle(index);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ex = oval.rx + TICK_GAP;
    const ey = oval.ry + TICK_GAP;
    const x1 = oval.cx + ex * cos;
    const y1 = oval.cy + ey * sin;
    // Along the ellipse's normal, so ticks stand straight out of the oval.
    const nLen = Math.hypot(cos / ex, sin / ey);
    const nx = cos / ex / nLen;
    const ny = sin / ey / nLen;

    const progress = useSharedValue(lit ? 1 : 0);
    useEffect(() => {
        progress.value = withTiming(lit ? 1 : 0, { duration: 220 });
    }, [lit, progress]);

    const animatedProps = useAnimatedProps(() => {
        const length = TICK_LENGTH + (TICK_LIT_LENGTH - TICK_LENGTH) * progress.value;
        return { x2: x1 + nx * length, y2: y1 + ny * length, strokeOpacity: progress.value };
    });

    return (
        <>
            <Line
                x1={x1}
                y1={y1}
                x2={x1 + nx * TICK_LENGTH}
                y2={y1 + ny * TICK_LENGTH}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth={TICK_WIDTH}
                strokeLinecap="round"
            />
            <AnimatedLine
                x1={x1}
                y1={y1}
                stroke={getThemeColor('success')}
                strokeWidth={TICK_WIDTH}
                strokeLinecap="round"
                animatedProps={animatedProps}
            />
        </>
    );
});
