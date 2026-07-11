export type BlockType =
  | 'button' | 'text' | 'input' | 'image' | 'container'
  | 'toggle' | 'number' | 'timer' | 'database' | 'list'
  | 'chart' | 'form' | 'video' | 'embed' | 'apiBlock';

export type ActionType =
  | 'increment' | 'decrement' | 'set' | 'toggle' | 'reset'
  | 'setVisible' | 'setHidden' | 'navigate'
  | 'addRow' | 'deleteRow' | 'updateField'
  | 'callAPI' | 'playAnimation' | 'submitForm';

export type TriggerEvent =
  | 'onClick' | 'onChange' | 'onSubmit' | 'onHover'
  | 'onTrue' | 'onFalse' | 'onTick' | 'onComplete'
  | 'onLoad' | 'onRowAdded' | 'onFieldChanged';

export type Permission = 'public' | 'authenticated' | 'author' | 'admin';

export type ConditionOperator =
  | 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'contains' | 'isEmpty'
  | 'is ON' | 'is_ON' | 'is OFF' | 'is_OFF' | 'greater than' | 'less than';

export interface ShadowConfig {
  x: number; y: number; blur: number; spread: number; color: string;
}

export interface StyleConfig {
  backgroundColor: string;
  color: string;
  borderRadius: number;
  fontSize: number;
  fontWeight: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  opacity: number;
  width: number | 'auto' | '100%';
  height: number | 'auto';
  borderWidth: number;
  borderColor: string;
  borderStyle: 'solid' | 'dashed' | 'dotted' | 'none';
  shadow: ShadowConfig | null;
}

export interface HoverAnimation { scale: number; duration: number; }
export interface ClickAnimation { scale: number; duration: number; }

export interface AnimationConfig {
  entrance: 'none' | 'fadeIn' | 'slideLeft' | 'slideRight' | 'slideUp' | 'scaleUp';
  entranceDuration: number;
  entranceDelay: number;
  entranceTrigger: 'onLoad' | 'onVisible';
  hover: HoverAnimation | null;
  click: ClickAnimation | null;
}

export interface BlockProps {
  blockName?: string;
  label?: string;
  placeholder?: string;
  src?: string;
  content?: string;
  defaultValue?: any;
  boundToFieldId?: string | null;
}

export interface Block {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  props: BlockProps;
  styles: StyleConfig;
  animations: AnimationConfig;
  parentId: string | null;
  children: string[];
  pageId: string;
}

export interface ConditionConfig {
  fieldId: string;
  operator: ConditionOperator;
  value: any;
}

export interface WorkflowStep {
  id: string;
  action: ActionType;
  targetId: string;
  value?: any;
  amount?: number;
  fieldId?: string;
  condition: ConditionConfig | null;
}

export interface Workflow {
  id: string;
  sourceId: string;
  sourceEvent: TriggerEvent;
  steps: WorkflowStep[];
  permission: Permission;
  pageId: string;
}

export interface FormulaBinding {
  id: string;
  targetBlockId: string;
  targetProperty: 'visible' | 'content' | 'backgroundColor' | 'disabled' | string;
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
  fontSize?: number;
  textColor?: string;
  mode?: 'countdown' | 'interval';
  duration?: number;
  autoStart?: boolean;
}

export interface DatabaseField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'url' | 'imageUrl';
  defaultValue: any;
  options?: string[];
}

export interface DatabaseRow { id: string; [fieldId: string]: any; }

export interface Database {
  id: string;
  name: string;
  fields: DatabaseField[];
  rows: DatabaseRow[];
}

export interface Page {
  id: string;
  name: string;
  route: string;
  layoutTemplateId: string | null;
  blocks: Block[];
  workflows: Workflow[];
  formulas: FormulaBinding[];
  databases: Database[];
}

export interface CreoraFile {
  version: '1.0';
  metadata: { name: string; created: string; modified: string };
  pages: Page[];
  layoutTemplates: Page[];
}
