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
  } else if (type === 'toggleBlock') {
    const runtimeValue = typeof runtimeState?.value === 'boolean' ? runtimeState.value : false;
    Object.assign(inner, {
      width: '44px',
      height: '24px',
      borderRadius: '12px',
      backgroundColor: runtimeValue ? '#22c55e' : '#d1d5db',
      position: 'relative',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      userSelect: 'none',
    });
  } else if (type === 'inputBlock') {
    Object.assign(outer, {
      display: 'flex',
      alignItems: 'center',
      width: runtimeState?.width !== undefined ? `${runtimeState.width}px` : '240px',
      background: runtimeState?.backgroundColor || '#1e293b',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
      padding: '6px 10px',
      boxSizing: 'border-box',
      gap: '8px',
    });
    Object.assign(inner, {
      flex: 1,
      boxSizing: 'border-box',
      padding: '6px 12px',
      background: '#ffffff',
      color: '#1e293b',
      border: '1px solid #cbd5e1',
      borderRadius: '4px',
      outline: 'none',
      fontSize: '14px',
    });
  } else if (type === 'textLabelBlock') {
    Object.assign(inner, {
      fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '1.2rem',
      fontWeight: 500,
      color: runtimeState?.textColor || '#ffffff',
      background: runtimeState?.backgroundColor || '#0f172a',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '6px',
      padding: '10px 20px',
      minWidth: '100px',
      minHeight: '38px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: runtimeState?.width !== undefined ? '100%' : 'auto',
      boxSizing: 'border-box',
      userSelect: 'none',
    });
  } else if (type === 'formulaDisplayBlock') {
    Object.assign(inner, {
      fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '1.8rem',
      fontWeight: 700,
      color: runtimeState?.textColor || '#ffffff',
      background: runtimeState?.backgroundColor || '#7c3aed',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
      padding: '10px 20px',
      minWidth: '90px',
      minHeight: '44px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: runtimeState?.width !== undefined ? '100%' : 'auto',
      boxSizing: 'border-box',
      userSelect: 'none',
      gap: '8px',
      boxShadow: '0 4px 6px -1px rgba(124, 58, 237, 0.2), 0 2px 4px -1px rgba(124, 58, 237, 0.1)',
    });
  }

  return { outer, inner };
}
