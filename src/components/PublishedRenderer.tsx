import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore, useAtomValue } from 'jotai';
import { supabase } from '../lib/supabase';
import { blockToCSS } from '../lib/renderBlockStyles';
import { executeWorkflow, recalculateAllFormulas } from '../lib/bindingEngine';
import {
  blockPositionAtom,
  blockRuntimeAtom,
  workflowsAtom,
  formulasAtom,
  connectionsAtom,
  allBlockIdsAtom,
} from '../state/atoms';

// Simple recursive block extractor
interface ExtractedBlock {
  id: string;
  type: string;
  attrs: any;
}

const extractBlocks = (node: any): ExtractedBlock[] => {
  if (!node) return [];
  const list: ExtractedBlock[] = [];
  const supportedTypes = ['buttonBlock', 'numberDisplayBlock', 'toggleBlock', 'inputBlock', 'textLabelBlock', 'formulaDisplayBlock'];
  if (node.attrs?.blockId && supportedTypes.includes(node.type)) {
    list.push({
      id: node.attrs.blockId,
      type: node.type,
      attrs: node.attrs,
    });
  }
  if (node.content) {
    node.content.forEach((child: any) => {
      list.push(...extractBlocks(child));
    });
  }
  return list;
};

// Render block wrapper component to subscribe to Jotai values reactively
function RenderedBlock({ block }: { block: ExtractedBlock }) {
  const position = useAtomValue(blockPositionAtom(block.id));
  const runtimeState = useAtomValue(blockRuntimeAtom(block.id));
  const store = useStore();

  const { outer: outerStyle, inner: innerStyle } = blockToCSS(block.type, position, runtimeState);

  if (block.type === 'buttonBlock') {
    return (
      <div style={outerStyle}>
        <button
          style={innerStyle}
          onClick={() => {
            executeWorkflow(block.id, 'onClick', store);
            recalculateAllFormulas(store);
          }}
        >
          {block.attrs.label || 'Button'}
        </button>
      </div>
    );
  }

  if (block.type === 'numberDisplayBlock') {
    return (
      <div style={outerStyle}>
        <div style={innerStyle}>
          {String(runtimeState?.value ?? 0)}
        </div>
      </div>
    );
  }

  if (block.type === 'toggleBlock') {
    const runtimeValue = typeof runtimeState?.value === 'boolean' ? runtimeState.value : false;
    return (
      <div style={outerStyle}>
        <div
          style={innerStyle}
          onClick={() => {
            const nextVal = !runtimeValue;
            store.set(blockRuntimeAtom(block.id), {
              ...runtimeState,
              value: nextVal,
            });
            executeWorkflow(block.id, 'onClick', store);
            recalculateAllFormulas(store);
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: 'white',
              position: 'absolute',
              top: '2px',
              left: runtimeValue ? '22px' : '2px',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
        </div>
      </div>
    );
  }

  if (block.type === 'inputBlock') {
    return (
      <div style={outerStyle}>
        <input
          type="text"
          style={innerStyle}
          value={String(runtimeState?.value ?? '')}
          onChange={(e) => {
            store.set(blockRuntimeAtom(block.id), {
              ...runtimeState,
              value: e.target.value,
            });
            executeWorkflow(block.id, 'onChange', store);
            recalculateAllFormulas(store);
          }}
          placeholder="Type something..."
        />
      </div>
    );
  }

  if (block.type === 'textLabelBlock') {
    return (
      <div style={outerStyle}>
        <div style={innerStyle}>
          {String(runtimeState?.value ?? '')}
        </div>
      </div>
    );
  }

  if (block.type === 'formulaDisplayBlock') {
    return (
      <div style={outerStyle}>
        <div style={innerStyle}>
          <span style={{ 
            fontSize: '11px', 
            background: 'rgba(255, 255, 255, 0.2)', 
            padding: '2px 6px', 
            borderRadius: '4px',
            textTransform: 'uppercase',
            fontWeight: 'bold',
            letterSpacing: '0.5px'
          }}>
            fx
          </span>
          {String(runtimeState?.value ?? '0')}
        </div>
      </div>
    );
  }

  return null;
}

export default function PublishedRenderer() {
  const { pageId } = useParams<{ pageId: string }>();
  const store = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageName, setPageName] = useState('Published Page');
  const [blocksList, setBlocksList] = useState<ExtractedBlock[]>([]);

  useEffect(() => {
    if (!pageId) return;

    const fetchPage = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .rpc('get_page', { p_id: pageId })
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          setError('Page not found');
          return;
        }

        const blocksData = data.blocks || {};
        const workflowsData = data.workflows || [];
        setPageName(blocksData.pageName || 'Published Page');

        // Extract blocks from documentContent
        const documentContent = blocksData.documentContent || {};
        const extracted = extractBlocks(documentContent);
        setBlocksList(extracted);

        // Populate Jotai store
        store.set(workflowsAtom, workflowsData);
        store.set(formulasAtom, blocksData.formulas || []);
        store.set(connectionsAtom, blocksData.connections || []);

        const blockIds = extracted.map((b) => b.id);
        store.set(allBlockIdsAtom, blockIds);

        if (blocksData.positions) {
          Object.entries(blocksData.positions).forEach(([id, pos]: [string, any]) => {
            store.set(blockPositionAtom(id), pos);
          });
        }

        if (blocksData.runtimeStates) {
          Object.entries(blocksData.runtimeStates).forEach(([id, rState]: [string, any]) => {
            store.set(blockRuntimeAtom(id), rState);
          });
        }

        // Recalculate initial values
        recalculateAllFormulas(store);
      } catch (err: any) {
        console.error('Failed to load published page:', err);
        setError(err.message || 'Failed to load page');
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [pageId, store]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', fontFamily: 'sans-serif' }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e2e8f0',
          borderTopColor: '#4f46e5',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ marginTop: '16px', color: '#64748b', fontWeight: 500 }}>Loading page...</p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', fontFamily: 'sans-serif' }}>
        <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px' }}>
          <h2 style={{ color: '#ef4444', margin: '0 0 8px 0' }}>Error</h2>
          <p style={{ color: '#64748b', margin: '0 0 16px 0' }}>{error}</p>
          <a href="/" style={{ display: 'inline-block', background: '#4f46e5', color: '#fff', padding: '8px 16px', borderRadius: '6px', textDecoration: 'none', fontWeight: 500 }}>Go to Editor</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Premium Header */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>{pageName}</h1>
        </div>
        <a href="/" style={{ fontSize: '13px', color: '#4f46e5', textDecoration: 'none', fontWeight: 500 }}>Edit Dashboard</a>
      </header>

      {/* Canvas view area */}
      <div
        id="editor-container"
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'auto',
          padding: '24px'
        }}
      >
        {blocksList.map((block) => (
          <RenderedBlock key={block.id} block={block} />
        ))}
      </div>
    </div>
  );
}
