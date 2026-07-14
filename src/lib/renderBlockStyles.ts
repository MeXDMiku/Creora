import type { CSSProperties } from 'react';

export function blockToCSS(
  type: string,
  position: { x: number; y: number },
  runtimeState: any
): { outer: CSSProperties; inner: CSSProperties } {
  const outer: CSSProperties = {
    display: 'block',
    position: 'absolute',
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: runtimeState?.width !== undefined ? `${runtimeState.width}px` : 'max-content',
    opacity: runtimeState?.opacity !== undefined ? runtimeState.opacity / 100 : 1,
  };

  const inner: CSSProperties = {};

  if (type === 'buttonBlock') {
    Object.assign(inner, {
      padding: '8px 16px',
      background: runtimeState?.backgroundColor || '#6366f1',
      color: runtimeState?.textColor || 'white',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
      cursor: 'pointer',
      border: 'none',
      fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '14px',
      userSelect: 'none',
      display: 'inline-block',
      textAlign: 'center',
      width: runtimeState?.width !== undefined ? '100%' : 'auto',
      boxSizing: 'border-box',
    });
  } else if (type === 'numberDisplayBlock') {
    Object.assign(inner, {
      fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '2rem',
      fontWeight: 700,
      color: runtimeState?.textColor || '#ffffff',
      background: runtimeState?.backgroundColor || '#1e293b',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
      padding: '12px 24px',
      minWidth: '80px',
      minHeight: '48px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: runtimeState?.width !== undefined ? '100%' : 'auto',
      boxSizing: 'border-box',
      userSelect: 'none',
    });
  }

  return { outer, inner };
}
