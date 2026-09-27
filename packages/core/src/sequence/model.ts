import type { LabelMark } from '../markup';
import type { SourceRange } from '../text';

/** Structural model of a sequence diagram (spec §13.5, v1.1). Ranges are diagram-relative. */

export type ParticipantKind =
  | 'participant' | 'actor' | 'boundary' | 'control' | 'entity' | 'database' | 'collections' | 'queue';

export const PARTICIPANT_KINDS: readonly ParticipantKind[] = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue'];

export interface Participant {
  id: string;
  label: string;
  /** Bold / italic ranges of `label` (spec label-formatting). */
  labelMarks?: LabelMark[];
  kind: ParticipantKind;
  boxId?: string;
  /** Index into `body` order of the create / destroy statements, when present. */
  createdBy?: string;
  destroyedBy?: string;
  links: { label: string; url: string }[];
  range: SourceRange;
}

export type ArrowKind =
  | 'solid' | 'solidArrow' | 'solidBidirectional' | 'solidCross' | 'solidOpen'
  | 'halfTop' | 'halfBottom' | 'stickTop' | 'stickBottom'
  | 'halfTopReverse' | 'halfBottomReverse' | 'stickTopReverse' | 'stickBottomReverse';

export interface Message {
  id: string;
  from: string;
  to: string;
  label: string;
  labelMarks?: LabelMark[];
  arrow: ArrowKind;
  dotted: boolean;
  /** `+` suffix: activates the receiver. */
  activatesTarget?: boolean;
  /** `-` suffix: deactivates the sender. */
  deactivatesSource?: boolean;
  central?: 'source' | 'target' | 'both';
  sequenceNumber?: number;
  range: SourceRange;
}

export interface Note {
  id: string;
  placement: 'leftOf' | 'rightOf' | 'over';
  participants: [string] | [string, string];
  text: string;
  textMarks?: LabelMark[];
  range: SourceRange;
}

export type FragmentKind = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break' | 'rect';

export interface FragmentBranch {
  label: string;
  labelMarks?: LabelMark[];
  children: SequenceNode[];
  range: SourceRange;
}

export interface Fragment {
  id: string;
  kind: FragmentKind;
  /** `par_over` spans all participants. */
  over?: boolean;
  label: string;
  labelMarks?: LabelMark[];
  branches: FragmentBranch[];
  color?: string;
  range: SourceRange;
}

export type SequenceNode =
  | { type: 'message'; message: Message }
  | { type: 'note'; note: Note }
  | { type: 'activation'; id: string; participant: string; on: boolean; range: SourceRange }
  | { type: 'create'; id: string; participant: string; range: SourceRange }
  | { type: 'destroy'; id: string; participant: string; attachTo: 'prev' | 'next' | 'standalone'; range: SourceRange }
  | { type: 'fragment'; fragment: Fragment };

export interface Box {
  id: string;
  label?: string;
  labelMarks?: LabelMark[];
  color: string;
  members: string[];
  range: SourceRange;
}

export interface SequenceModel {
  kind: 'sequence';
  title?: string;
  accTitle?: string;
  accDescr?: string;
  participants: Participant[];
  boxes: Box[];
  body: SequenceNode[];
  autonumber: boolean;
}
