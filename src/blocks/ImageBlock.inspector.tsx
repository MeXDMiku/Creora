import { useAtom, useSetAtom, useStore } from 'jotai'
import { useRef } from 'react'
import { blockRuntimeAtom, triggerSaveAtom, getBlockTypeDisplayName } from '../state/atoms'
import {
  normalizeImageUrl,
  isProbablyImageUrl,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  formatBytes,
} from '../lib/images'
import { uploadImage } from '../lib/imageUpload'

const fieldStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '4px',
  width: '100%',
  padding: '6px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  boxSizing: 'border-box',
  background: '#f8fafc',
  color: '#0f172a',
  outline: 'none',
  fontSize: '13px',
}

const hintStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: '#64748b',
  marginTop: '4px',
  lineHeight: 1.4,
}

export default function ImageBlockInspector({ blockId }: { blockId: string; editor: any }) {
  const [runtimeState, setRuntimeState] = useAtom(blockRuntimeAtom(blockId))
  const triggerSave = useSetAtom(triggerSaveAtom)
  const store = useStore()
  const fileRef = useRef<HTMLInputElement | null>(null)

  const raw = typeof runtimeState.value === 'string' ? runtimeState.value : ''
  const cleaned = normalizeImageUrl(raw)
  const refused = raw.trim() !== '' && cleaned === ''

  const set = (patch: Record<string, unknown>) => {
    setRuntimeState(prev => ({ ...prev, ...patch }))
    triggerSave(prev => prev + 1)
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '12px' }}>
        Block Name
        <input
          type="text"
          value={runtimeState.blockName || ''}
          onChange={(e) => set({ blockName: e.target.value })}
          placeholder={getBlockTypeDisplayName('imageBlock')}
          style={fieldStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '4px' }}>
        Address of the picture
        <input
          type="text"
          value={raw}
          onChange={(e) => set({ value: e.target.value })}
          placeholder="https://... or upload below"
          style={{ ...fieldStyle, borderColor: refused ? '#dc2626' : '#ccc' }}
        />
      </label>
      {refused ? (
        <span style={{ ...hintStyle, color: '#dc2626' }}>
          That is not an address a browser will load a picture from, so nothing
          is being shown. Only http, https and inline image data are allowed.
        </span>
      ) : raw.trim() !== '' && !isProbablyImageUrl(raw) ? (
        <span style={hintStyle}>
          That address does not end in a picture file. It may still work - plenty
          of image addresses do not - but if nothing appears, that is the first
          thing to check.
        </span>
      ) : (
        <span style={hintStyle}>
          This is the block's value, which means anything can set it: a wire from
          a Database column, a Live Data field, or a button.
        </span>
      )}

      <div style={{ marginTop: '12px', marginBottom: '12px' }}>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_MIME_TYPES.join(',')}
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files && e.target.files[0]
            e.target.value = ''
            if (!file) return
            await uploadImage(file, blockId, store)
            triggerSave(prev => prev + 1)
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!!runtimeState.loading}
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '6px',
            border: '1px solid #c7d2fe',
            background: '#eef2ff',
            color: '#4338ca',
            cursor: runtimeState.loading ? 'progress' : 'pointer',
          }}
        >
          {runtimeState.loading ? 'Uploading...' : 'Upload a picture'}
        </button>
        <span style={hintStyle}>
          Up to {formatBytes(MAX_IMAGE_BYTES)}. PNG, JPEG, GIF, WebP, AVIF or SVG.
        </span>
        {runtimeState.uploadError && (
          <span style={{ ...hintStyle, color: '#dc2626' }}>{runtimeState.uploadError}</span>
        )}
      </div>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        Description for people who cannot see it
        <input
          type="text"
          value={runtimeState.alt || ''}
          onChange={(e) => set({ alt: e.target.value })}
          placeholder="e.g. A red bicycle against a wall"
          style={fieldStyle}
        />
        <span style={hintStyle}>
          Read aloud by screen readers, and shown if the picture fails to load.
          Leave it blank only when the picture is decoration.
        </span>
      </label>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        How it fills its box
        <select
          value={runtimeState.objectFit || 'cover'}
          onChange={(e) => set({ objectFit: e.target.value })}
          style={fieldStyle}
        >
          <option value="cover">Fill the box, crop the overflow</option>
          <option value="contain">Fit inside, show all of it</option>
          <option value="fill">Stretch to the box</option>
          <option value="scale-down">Fit inside, never enlarge</option>
          <option value="none">Original size</option>
        </select>
      </label>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '12px', fontSize: '13px' }}>
        <input
          type="checkbox"
          checked={!!runtimeState.allowVisitorUpload}
          onChange={(e) => set({ allowVisitorUpload: e.target.checked })}
          style={{ marginTop: '3px' }}
        />
        <span>
          Visitors can upload their own
          <span style={hintStyle}>
            Turns this into a file field on the published page. The address of
            whatever they upload becomes this block's value, so a form can save
            it into a Database column like any other field.
          </span>
        </span>
      </label>

      {runtimeState.allowVisitorUpload && (
        <label style={{ display: 'block', marginBottom: '12px' }}>
          Words on the upload area
          <input
            type="text"
            value={runtimeState.uploadHint || ''}
            onChange={(e) => set({ uploadHint: e.target.value })}
            placeholder="Choose a picture"
            style={fieldStyle}
          />
        </label>
      )}

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Width (px)
        <input
          type="number"
          value={runtimeState.width !== undefined ? runtimeState.width : ''}
          onChange={(e) => set({ width: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="240"
          style={fieldStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Height (px)
        <input
          type="number"
          value={runtimeState.height !== undefined ? runtimeState.height : ''}
          onChange={(e) => set({ height: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="160"
          style={fieldStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Corner rounding: {runtimeState.borderRadius ?? 8}px
        <input
          type="range"
          min="0"
          max="200"
          value={runtimeState.borderRadius ?? 8}
          onInput={(e) => set({ borderRadius: Number((e.target as HTMLInputElement).value) })}
          style={{ display: 'block', marginTop: '4px', width: '100%' }}
        />
        <span style={hintStyle}>
          Drag it all the way for a circle, which is what an avatar needs.
        </span>
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        Opacity: {runtimeState.opacity ?? 100}%
        <input
          type="range"
          min="0"
          max="100"
          value={runtimeState.opacity ?? 100}
          onInput={(e) => set({ opacity: Number((e.target as HTMLInputElement).value) })}
          style={{ display: 'block', marginTop: '4px', width: '100%' }}
        />
      </label>
    </div>
  )
}
