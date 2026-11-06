import { Download, ImagePlus, Link2, UserCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { tokenCrop } from '@atlas/shared';
import { imageUrl, useImages } from '@/api/gm-queries';
import { EntityPicker, type PickedEntity } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { Input, Label, NativeSelect } from '@/components/ui/inputs';
import { useWorld } from '@/lib/world-context';

const SIZES = [140, 280, 560] as const;
const PREVIEW = 280;

type Shape = 'circle' | 'square';

/** Draws a token: the cropped picture inside a shape, with a coloured ring. */
function drawToken(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  options: {
    size: number;
    shape: Shape;
    zoom: number;
    panX: number;
    panY: number;
    ring: string;
    ringWidth: number;
    background: string;
  },
) {
  const { size, shape, ring, ringWidth } = options;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  const inset = ringWidth / 2;
  const path = () => {
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(size / 2, size / 2, size / 2 - inset, 0, Math.PI * 2);
    else ctx.roundRect(inset, inset, size - ringWidth, size - ringWidth, size * 0.12);
  };
  ctx.save();
  path();
  ctx.clip();
  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, size, size);
  if (image) {
    const crop = tokenCrop(
      image.naturalWidth,
      image.naturalHeight,
      options.zoom,
      options.panX,
      options.panY,
    );
    ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size, size);
  }
  ctx.restore();
  if (ringWidth > 0) {
    path();
    ctx.lineWidth = ringWidth;
    ctx.strokeStyle = ring;
    ctx.stroke();
  }
}

/** Make round (or square) tokens from a picture, ready to drop onto a virtual tabletop. */
function TokensPage() {
  const { world } = useWorld();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [name, setName] = useState('token');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [entity, setEntity] = useState<PickedEntity | null>(null);
  const { data: pictures = [] } = useImages(world.id, { entityId: entity?.id });
  const [size, setSize] = useState<number>(280);
  const [shape, setShape] = useState<Shape>('circle');
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [ring, setRing] = useState('#b45309');
  const [ringWidth, setRingWidth] = useState(8);
  const [background, setBackground] = useState('#1f2937');

  // Load whichever picture is chosen. A file from the computer is read into an object URL.
  useEffect(() => {
    if (!source) return;
    const loaded = new Image();
    loaded.onload = () => {
      setImage(loaded);
      setPanX(0);
      setPanY(0);
      setZoom(1);
    };
    loaded.src = source;
    return () => {
      loaded.onload = null;
    };
  }, [source]);

  useEffect(() => {
    if (!source?.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(source);
  }, [source]);

  useEffect(() => {
    if (!canvas.current) return;
    drawToken(canvas.current, image, {
      size: PREVIEW,
      shape,
      zoom,
      panX,
      panY,
      ring,
      ringWidth: Math.round((ringWidth / size) * PREVIEW),
      background,
    });
  }, [image, shape, zoom, panX, panY, ring, ringWidth, background, size]);

  function download() {
    const out = document.createElement('canvas');
    drawToken(out, image, { size, shape, zoom, panX, panY, ring, ringWidth, background });
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: `${name}.png` }).click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Game tools</p>
        <h1 className="font-serif text-3xl font-semibold">Token maker</h1>
        <p className="mt-1 text-muted-foreground">
          Turn a portrait into a token with a coloured ring, as a transparent PNG. Everything
          happens in your browser; nothing is uploaded.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="token-file">Picture</Label>
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="token-file"
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm hover:border-primary/50"
              >
                <ImagePlus className="size-4" /> Choose a file…
              </label>
              <input
                id="token-file"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setName(file.name.replace(/\.[^.]+$/, '') || 'token');
                  setSource(URL.createObjectURL(file));
                }}
              />
              <EntityPicker
                onSelect={setEntity}
                trigger={
                  <Button type="button" variant="outline">
                    <Link2 /> {entity ? entity.name : 'Or use an entry’s pictures'}
                  </Button>
                }
              />
            </div>
            {entity ? (
              pictures.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {entity.name} has no pictures yet. Add some on its page.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {pictures.map((picture) => (
                    <li key={picture.id}>
                      <button
                        type="button"
                        aria-label={picture.caption || `Picture of ${entity.name}`}
                        onClick={() => {
                          setName(entity.name);
                          setSource(imageUrl(world.id, picture.id));
                        }}
                        className="overflow-hidden rounded-md border hover:border-primary"
                      >
                        <img
                          src={imageUrl(world.id, picture.id, 'thumbnail')}
                          alt=""
                          className="size-16 object-cover"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="token-zoom">Zoom</Label>
              <input
                id="token-zoom"
                type="range"
                min={1}
                max={4}
                step={0.05}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="token-panx">Slide left or right</Label>
              <input
                id="token-panx"
                type="range"
                min={-1}
                max={1}
                step={0.02}
                value={panX}
                onChange={(event) => setPanX(Number(event.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="token-pany">Slide up or down</Label>
              <input
                id="token-pany"
                type="range"
                min={-1}
                max={1}
                step={0.02}
                value={panY}
                onChange={(event) => setPanY(Number(event.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="token-ringwidth">Ring thickness</Label>
              <input
                id="token-ringwidth"
                type="range"
                min={0}
                max={24}
                step={1}
                value={ringWidth}
                onChange={(event) => setRingWidth(Number(event.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="token-ring">Ring colour</Label>
              <input
                id="token-ring"
                type="color"
                value={ring}
                onChange={(event) => setRing(event.target.value)}
                className="h-9 w-full cursor-pointer rounded-md border bg-transparent p-1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="token-bg">Behind the picture</Label>
              <input
                id="token-bg"
                type="color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                className="h-9 w-full cursor-pointer rounded-md border bg-transparent p-1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="token-shape">Shape</Label>
              <NativeSelect
                id="token-shape"
                value={shape}
                onChange={(event) => setShape(event.target.value as Shape)}
              >
                <option value="circle">Round</option>
                <option value="square">Rounded square</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="token-size">Size</Label>
              <NativeSelect
                id="token-size"
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
              >
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} × {s} px
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="token-name">File name</Label>
              <Input
                id="token-name"
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div
            className="flex items-center justify-center rounded-xl border p-4"
            style={{
              backgroundImage:
                'repeating-conic-gradient(var(--color-muted) 0% 25%, transparent 0% 50%)',
              backgroundSize: '20px 20px',
            }}
          >
            <canvas
              ref={canvas}
              width={PREVIEW}
              height={PREVIEW}
              aria-label="Token preview"
              className="size-[280px] max-w-full"
            />
          </div>
          {!image ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserCircle className="size-4" /> Choose a picture to see the token.
            </p>
          ) : null}
          <Button type="button" className="w-full" disabled={!image} onClick={download}>
            <Download /> Download PNG
          </Button>
        </div>
      </div>
    </div>
  );
}

export { TokensPage as Component };
