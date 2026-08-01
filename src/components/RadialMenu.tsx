import type { IconType } from "react-icons";
import { FaPause, FaChartSimple, FaNoteSticky } from "react-icons/fa6";
import { FaPlay } from "react-icons/fa";
import { IoMdSettings } from "react-icons/io";

interface RadialAction {
  action: string;
  Icon: IconType;
  label: string;
  isNote?: boolean;
}

interface RadialMenuProps {
  position: string;
  break: number;
  open: boolean;
}

const QUADRANT_START: Record<string, number> = {
  bl: -90,
  tl: 0,
  tr: 90,
  br: 180,
};

const INNER_R = 70;
const OUTER_R = 116;
const ICON_R = (INNER_R + OUTER_R) / 2;
const PAD = 6;
const VIEW = OUTER_R + PAD;
const ICON_SIZE = 22;

function polar(r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

function sectorPath(a0: number, a1: number): string {
  const o0 = polar(OUTER_R, a0);
  const o1 = polar(OUTER_R, a1);
  const i1 = polar(INNER_R, a1);
  const i0 = polar(INNER_R, a0);
  return [
    `M ${o0.x.toFixed(2)} ${o0.y.toFixed(2)}`,
    `A ${OUTER_R} ${OUTER_R} 0 0 1 ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A ${INNER_R} ${INNER_R} 0 0 0 ${i0.x.toFixed(2)} ${i0.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function RadialMenu({
  position,
  break: breakState,
  open,
}: RadialMenuProps) {
  const ACTIONS: RadialAction[] = [
    breakState === 0
      ? { action: "break", Icon: FaPause, label: "Take a break" }
      : { action: "endbreak", Icon: FaPlay, label: "End break" },
    { action: "summary", Icon: FaChartSimple, label: "Activity summary" },
    { action: "settings", Icon: IoMdSettings, label: "Settings" },
    { action: "note", Icon: FaNoteSticky, label: "Reminder note", isNote: true },
  ];

  const start = QUADRANT_START[position] ?? QUADRANT_START.bl;
  const step = 90 / ACTIONS.length;

  return (
    <div
      className={`radial-menu-wrap${open ? "" : " radial-menu-wrap--closed"}`}
      aria-hidden={!open}
    >
      <svg
        className="radial-menu"
        width={VIEW * 2}
        height={VIEW * 2}
        viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
      >
        {ACTIONS.map(({ action, Icon, label, isNote }, i) => {
          const a0 = start + i * step;
          const a1 = start + (i + 1) * step;
          const mid = (a0 + a1) / 2;
          const c = polar(ICON_R, mid);
          return (
            <g
              key={action}
              className="slice-group"
              {...(isNote
                ? { "data-note-trigger": true }
                : { "data-action": action })}
              role="button"
              aria-label={label}
            >
              <path className="menu-slice" d={sectorPath(a0, a1)} />
              <g
                className="group-icon"
                transform={`translate(${(c.x - ICON_SIZE / 2).toFixed(2)}, ${(
                  c.y -
                  ICON_SIZE / 2
                ).toFixed(2)})`}
              >
                <Icon size={ICON_SIZE} color="#fff" />
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
