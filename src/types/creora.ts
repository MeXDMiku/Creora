export type BlockType = 
  | 'button'
  | 'number'
  | 'toggle'
  | 'input'
  | 'text'
  | 'timer'
  | 'chart'
  | 'database'
  | 'list'
  | 'shape';

export interface WorkflowStep {
  targetId: string;
  action: 'increment' | 'decrement' | 'set' | 'toggle' | 'setVisible' | 'setHidden' | 'addRow' | 'updateRow' | 'deleteRow';
  amount?: number;
  value?: any;
  condition?: {
    fieldId: string;
    operator: 'is ON' | 'is OFF' | 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'contains' | 'isEmpty' | 'is_ON' | 'is_OFF' | 'greater than' | 'less than';
    value?: any;
  };
  mappings?: Record<string, { source: 'fixed' | 'block'; value: string }>;
  matchColumn?: string;
  matchSource?: 'fixed' | 'block';
  matchValue?: string;
}

export type TriggerEvent = 'onClick' | 'onChange' | 'onTick' | 'onComplete';

export interface Workflow {
  id: string;
  sourceId: string;
  sourceEvent: TriggerEvent;
  steps: WorkflowStep[];
  permission?: 'public' | 'authenticated' | 'author' | 'admin';
}

export interface Connection {
  id: string;
  sourceBlockId: string;
  targetBlockId: string;
}

export interface StyleConfig {
  backgroundColor?: string;
  color?: string;
  borderRadius?: number;
  fontSize?: number;
  fontWeight?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  opacity?: number;
  width?: number | string;
  height?: number | string;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: string;
  shadow?: string | null;
}

export interface AnimationConfig {
  hoverScale?: number;
  clickScale?: number;
}

export interface BlockProps {
  blockName?: string;
  label?: string;
  defaultValue?: any;
  trackedBlockId?: string;
  history?: number[];
  columns?: { name: string; type: 'text' | 'number' | 'boolean' }[];
  rows?: { id: string; [key: string]: any }[];
  outputMode?: string;
  targetPageId?: string;
}

export interface Block {
  id: string;
  type: BlockType;
  props: BlockProps;
  styles: StyleConfig;
  animations?: AnimationConfig;
}

export interface Page {
  id: string;
  title: string;
  blocks: Block[];
  workflows: Workflow[];
  formulas?: FormulaBinding[];
}

export interface CreoraFile {
  version: string;
  activePageId: string;
  pages: Page[];
}

export interface FormulaBinding {
  id: string;
  targetBlockId: string;
  targetProperty: 'value';
  formula: string;
  pageId: string;
}

export interface BlockRuntimeState {
  blockName?: string;
  value: any;
  visible: boolean;
  disabled: boolean;
  loading: boolean;
  error: string | null;
  backgroundColor?: string;
  borderRadius?: number;
  min?: number;
  max?: number;
  opacity?: number;
  width?: number;
  height?: number;
  text?: string;
  role?: string | null;
  fontSize?: number;
  textColor?: string;
  mode?: 'countdown' | 'interval';
  duration?: number;
  autoStart?: boolean;
  trackedBlockId?: string;
  history?: number[];
  columns?: { name: string; type: 'text' | 'number' | 'boolean' }[];
  rows?: { id: string; [key: string]: any }[];
  outputMode?: string;
  targetPageId?: string;
}

export interface DatabaseField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'boolean';
}

export interface DatabaseRow {
  id: string;
  [key: string]: any;
}
