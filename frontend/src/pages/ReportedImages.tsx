import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Flag } from 'lucide-react';
import { menuItemImagesApi, MenuItemImage, resolveImageUrl } from '../services/api';

export default function ReportedImages() {
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: images = [], isLoading } = useQuery<MenuItemImage[]>({
    queryKey: ['reported-images'],
    queryFn: menuItemImagesApi.getReported,
    staleTime: 30 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (imageId: number) => menuItemImagesApi.deleteImage(imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reported-images'] });
      setConfirmDeleteId(null);
    },
  });

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-headline text-on-surface">Reported Images</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Customer-uploaded photos that have been flagged for review.
        </p>
      </div>

      {isLoading && (
        <p className="text-on-surface-variant text-sm">Loading…</p>
      )}

      {!isLoading && images.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant/50">
          <Flag size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No reported images at this time.</p>
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map(img => (
            <div
              key={img.id}
              className="bg-surface-container rounded-2xl overflow-hidden border border-outline-variant/10"
            >
              <div className="w-full h-48 bg-surface-container-high overflow-hidden">
                <img
                  src={resolveImageUrl(img.image_url) ?? undefined}
                  alt="Reported"
                  className="w-full h-full object-cover"
                  onError={e => {
                    (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
                  }}
                />
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-on-surface-variant/60">Menu item #{img.menu_item_id}</p>
                    <p className="text-xs text-on-surface-variant/60 mt-0.5">
                      Uploaded {new Date(img.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-error/10 text-error px-2.5 py-1 rounded-full">
                    <Flag size={12} />
                    <span className="text-xs font-bold">{img.report_count}</span>
                  </div>
                </div>

                {confirmDeleteId === img.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 py-2 text-xs rounded-xl border border-outline-variant/30 text-on-surface-variant"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(img.id)}
                      disabled={deleteMutation.isPending}
                      className="flex-1 py-2 text-xs rounded-xl bg-error text-on-error font-bold disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? 'Deleting…' : 'Confirm Delete'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(img.id)}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs rounded-xl border border-error/40 text-error hover:bg-error/5 transition-colors"
                  >
                    <Trash2 size={13} />
                    Delete Image
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
