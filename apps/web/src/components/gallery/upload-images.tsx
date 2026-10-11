import { ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { MAX_IMAGE_BYTES, type Visibility } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useUploadImage } from '@/api/gm-queries';
import { Button } from '@/components/ui/button';
import { useWorld } from '@/lib/world-context';

const MAX_MB = Math.round(MAX_IMAGE_BYTES / 1024 / 1024);

/** Adds one or more pictures, one after another. They start with the visibility you give. */
export function UploadImages({
  entityId = null,
  visibility = 'gm',
  label = 'Add pictures',
}: {
  entityId?: string | null;
  visibility?: Visibility;
  label?: string;
}) {
  const { world } = useWorld();
  const upload = useUploadImage(world.id);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let added = 0;
    for (const file of Array.from(files)) {
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} is over ${MAX_MB} MB.`);
        continue;
      }
      try {
        await upload.mutateAsync({ image: file, entityId, visibility });
        added++;
      } catch (error) {
        toast.error(`${file.name}: ${errorMessage(error)}`);
      }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    if (added > 0) toast.success(added === 1 ? 'Picture added' : `${added} pictures added`);
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="sr-only"
        aria-label={label}
        onChange={(event) => void onFiles(event.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <ImagePlus /> {busy ? 'Uploading…' : label}
      </Button>
    </>
  );
}
