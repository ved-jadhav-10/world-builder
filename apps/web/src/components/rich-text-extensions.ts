import { mergeAttributes, Node, ReactNodeViewRenderer } from '@tiptap/react';
import { SECRET_BLOCK_NODE } from '@atlas/shared';
import { MapEmbedView, TimelineEmbedView } from '@/components/rich-text-embed-views';

/** A part of an article only the GM sees. Everyone else is sent the article without it. */
export const SecretBlock = Node.create({
  name: SECRET_BLOCK_NODE,
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-secret-block]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-secret-block': 'true', class: 'secret-block' }),
    0,
  ],
});

/** A map shown inside an article as a picture that opens the map. */
export const MapEmbed = Node.create({
  name: 'mapEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ mapId: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-map-embed]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes({ 'data-map-embed': 'true', 'data-map-id': HTMLAttributes.mapId }),
  ],
  addNodeView: () => ReactNodeViewRenderer(MapEmbedView),
});

/** A short list of dated entries (all, or one type) shown inside an article. */
export const TimelineEmbed = Node.create({
  name: 'timelineEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ typeId: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-timeline-embed]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes({ 'data-timeline-embed': 'true', 'data-type-id': HTMLAttributes.typeId }),
  ],
  addNodeView: () => ReactNodeViewRenderer(TimelineEmbedView),
});
