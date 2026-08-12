import type { CSSProperties } from 'react';
import type { BlockRuntimeState } from '../types/creora';
import { parseCustomCss } from './customCss';

export function blockToCSS(
  type: string,
  position: { x: number; y: number },
  runtimeState?: BlockRuntimeState
): { outer: CSSProperties; inner: CSSProperties } {
  const outer: CSSProperties = {
    position: 'absolute',
    left: `${position.x}px`,
    top: `${position.y}px`,
    zIndex: 10,
    display: runtimeState?.visible === false ? 'none' : 'block',
    opacity: runtimeState?.opacity !== undefined ? runtimeState.opacity / 100 : 1,
  };

  const inner: CSSProperties = {};

  if (type === 'visitorBlock') {
    Object.assign(inner, {
      padding: '8px 14px',
      background: runtimeState?.backgroundColor || '#334155',
      color: runtimeState?.textColor || '#ffffff',
      borderRadius: runtimeState?.borderRadius !== undefined ? runtimeState.borderRadius + 'px' : '8px',
      fontSize: runtimeState?.fontSize !== undefined ? runtimeState.fontSize + 'px' : '16px',
      fontWeight: 600,
      display: 'inline-block',
      textAlign: 'center',
      minWidth: '100px',
      boxSizing: 'border-box',
    });
  } else if (type === 'dataSourceBlock') {
    Object.assign(inner, {
      padding: '10px 14px',
      background: runtimeState?.backgroundColor || '#0f172a',
      color: runtimeState?.textColor || '#ffffff',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
      fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '24px',
      fontWeight: 600,
      display: 'inline-block',
      textAlign: 'center',
      minWidth: '120px',
      width: runtimeState?.width !== undefined ? `${runtimeState.width}px` : 'auto',
      boxSizing: 'border-box',
    });
  } else if (type === 'buttonBlock') {
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
      padding: '8px 16px',
      display: 'inline-block',
      textAlign: 'center',
      minWidth: '80px',
      width: runtimeState?.width !== undefined ? '100%' : 'auto',
      boxSizing: 'border-box',
    });
  } else if (type === 'formulaDisplayBlock') {
    Object.assign(inner, {
      fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '2rem',
      fontWeight: 700,
      color: runtimeState?.textColor || '#ffffff',
      background: runtimeState?.backgroundColor || '#8b5cf6',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
      padding: '8px 16px',
      display: 'inline-block',
      textAlign: 'center',
      minWidth: '80px',
      width: runtimeState?.width !== undefined ? '100%' : 'auto',
      boxSizing: 'border-box',
    });
  } else if (type === 'toggleBlock') {
    Object.assign(inner, {
      padding: '6px 12px',
      background: runtimeState?.backgroundColor || '#10b981',
      color: 'white',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
      display: 'inline-block',
      width: runtimeState?.width !== undefined ? '100%' : 'auto',
      boxSizing: 'border-box',
    });
  } else if (type === 'inputBlock') {
    Object.assign(inner, {
      padding: '8px 12px',
      border: '1px solid #cbd5e1',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '4px',
      fontSize: '14px',
      background: runtimeState?.backgroundColor || 'white',
      color: '#1e293b',
      outline: 'none',
      width: runtimeState?.width !== undefined ? `${runtimeState.width}px` : '200px',
      boxSizing: 'border-box',
    });
  } else if (type === 'textLabelBlock') {
    Object.assign(inner, {
      fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '1rem',
      color: runtimeState?.textColor || '#ffffff',
      background: runtimeState?.backgroundColor || 'transparent',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '0px',
      padding: '4px 8px',
      display: 'inline-block',
      width: runtimeState?.width !== undefined ? '100%' : 'auto',
      boxSizing: 'border-box',
    });
  } else if (type === 'timerBlock') {
    Object.assign(inner, {
      padding: '8px 16px',
      background: runtimeState?.backgroundColor || '#10b981',
      color: runtimeState?.textColor || 'white',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
      fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '14px',
      userSelect: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: runtimeState?.width !== undefined ? '100%' : 'auto',
      boxSizing: 'border-box',
    });
  } else if (type === 'historyChartBlock') {
    Object.assign(inner, {
      padding: '12px',
      background: runtimeState?.backgroundColor || '#0f172a',
      color: runtimeState?.textColor || '#ffffff',
      borderRadius: '8px',
      width: '240px',
      boxSizing: 'border-box',
      userSelect: 'none',
    });
  } else if (type === 'databaseBlock') {
    Object.assign(inner, {
      padding: '12px',
      background: runtimeState?.backgroundColor || '#ffffff',
      color: '#0f172a',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      width: runtimeState?.width !== undefined ? `${runtimeState.width}px` : 'auto',
      boxSizing: 'border-box',
    });
  } else if (type === 'listBlock') {
    Object.assign(inner, {
      padding: '12px',
      background: runtimeState?.backgroundColor || '#ffffff',
      color: '#0f172a',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
      width: runtimeState?.width !== undefined ? `${runtimeState.width}px` : '280px',
      boxSizing: 'border-box',
      userSelect: 'none',
      gap: '8px',
      boxShadow: '0 4px 6px -1px rgba(124, 58, 237, 0.2), 0 2px 4px -1px rgba(124, 58, 237, 0.1)',
    });
  } else if (type === 'shapeBlock') {
    Object.assign(inner, {
      fontSize: runtimeState?.fontSize !== undefined ? `${runtimeState.fontSize}px` : '1rem',
      fontWeight: 500,
      color: runtimeState?.textColor || '#ffffff',
      background: runtimeState?.backgroundColor || '#3b82f6',
      borderRadius: runtimeState?.borderRadius !== undefined ? `${runtimeState.borderRadius}px` : '8px',
      padding: '8px 16px',
      minWidth: '60px',
      minHeight: '36px',
      height: runtimeState?.height !== undefined ? `${runtimeState.height}px` : 'auto',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: runtimeState?.width !== undefined ? '100%' : 'auto',
      boxSizing: 'border-box',
      userSelect: 'none',
    });
  }

  // The builder's own CSS goes on last, so it beats anything computed above.
  // A default is a starting point, never a ceiling.
  Object.assign(inner, parseCustomCss(runtimeState?.customCss));


  return { outer, inner };
}
