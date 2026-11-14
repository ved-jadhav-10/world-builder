import type { NodeTypes } from '@xyflow/react';
import { EmbedNode, EntryNode, FrameNode, ImageNode, NoteNode, SwatchNode } from './nodes';

export const boardNodeTypes: NodeTypes = {
  entry: EntryNode,
  note: NoteNode,
  image: ImageNode,
  frame: FrameNode,
  swatch: SwatchNode,
  embed: EmbedNode,
};
