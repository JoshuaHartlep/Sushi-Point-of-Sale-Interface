import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Trash2, Clock, Flag, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { menuItemImagesApi, MenuItemImage, resolveImageUrl } from '../services/api';

type Tab = 'pending' | 'reported';

export default function ImageModeration() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');

  // lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const touchStartX = useRef(0);

  // grid delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: pendingImages = [], isLoading: loadingPending } = useQuery<MenuItemImage[]>({
    queryKey: ['images-pending'],
    queryFn: menuItemImagesApi.getPending,
    staleTime: 15 * 1000,
  });

  const { data: reportedImages = [], isLoading: loadingReported } = useQuery<MenuItemImage[]>({
    queryKey: ['reported-images'],
    queryFn: menuItemImagesApi.getReported,
    staleTime: 30 * 1000,
  });

  const images = tab === 'pending' ? pendingImages : reportedImages;
  const isLoading = tab === 'pending' ? loadingPending : loadingReported;
  const currentImg = lightboxIndex !== null ? images[lightboxIndex] : null;

  const goTo = (idx: number) =>
    setLightboxIndex(Math.max(0, Math.min(images.length - 1, idx)));

  const closeLightbox = () => setLightboxIndex(null);

  const advanceOrClose = (actioned: number) => {
    if (lightboxIndex === null) return;
    const remaining = images.length - 1;
    if (remaining === 0 || currentImg?.id !== actioned) { closeLightbox(); return; }
    setLightboxIndex(Math.min(lightboxIndex, remaining - 1));
  };

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeLightbox(); return; }
      if (e.key === 'ArrowLeft') goTo(lightboxIndex - 1);
      if (e.key === 'ArrowRight') goTo(lightboxIndex + 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightboxIndex, images.length]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['images-pending'] });
    queryClient.invalidateQueries({ queryKey: ['reported-images'] });
  };

  const approveMutation = useMutation({
    mutationFn: (imageId: number) => menuItemImagesApi.approve(imageId),
    onSuccess: (_data, imageId) => { invalidateAll(); advanceOrClose(imageId); },
  });

  const deleteMutation = useMutation({
    mutationFn: (imageId: number) => menuItemImagesApi.deleteImage(imageId),
    onSuccess: (_data, imageId) => {
      invalidateAll();
      setConfirmDeleteId(null);
      advanceOrClose(imageId);
    },
  });

  const statusBadge = (status: MenuItemImage['status']) => {
    const cls =
      status === 'pending' ? 'bg-yellow-400/90 text-yellow-900' :
      status === 'approved' ? 'bg-green-500/90 text-white' :
      'bg-error/90 text-on-error';
    return (
      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${cls}`}>
        {status}
      </span>
    );
  };

  return (
    <>
      {/* ── Lightbox ── */}
      {lightboxIndex !== null && currentImg && (
        <div
          className="fixed inset-0 z-[60] flex"
          style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            if (delta < -50) goTo(lightboxIndex + 1);
            else if (delta > 50) goTo(lightboxIndex - 1);
          }}
        >
          {/* Image area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
              <span className="text-white/60 text-sm font-medium">
                {lightboxIndex + 1} / {images.length}
              </span>
              <button
                onClick={closeLightbox}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Image + arrows */}
            <div className="flex-1 flex items-center justify-center relative px-14 min-h-0">
              <button
                onClick={() => goTo(lightboxIndex - 1)}
                disabled={lightboxIndex === 0}
                className="absolute left-2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-20 hover:bg-white/20 transition-colors"
              >
                <ChevronLeft size={22} />
              </button>

              <img
                key={currentImg.id}
                src={resolveImageUrl(currentImg.image_url) ?? undefined}
                alt="Customer photo"
                className="max-w-full max-h-full object-contain rounded-2xl select-none"
                draggable={false}
              />

              <button
                onClick={() => goTo(lightboxIndex + 1)}
                disabled={lightboxIndex === images.length - 1}
                className="absolute right-2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-20 hover:bg-white/20 transition-colors"
              >
                <ChevronRight size={22} />
              </button>
            </div>

            {/* Dot indicators */}
            <div className="shrink-0 flex items-center justify-center gap-1.5 py-4">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setLightboxIndex(i)}
                  className={`rounded-full transition-all ${
                    i === lightboxIndex ? 'w-4 h-2 bg-white' : 'w-2 h-2 bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div className="w-64 shrink-0 flex flex-col bg-white/5 border-l border-white/10">
            <div className="p-5 flex flex-col gap-3">
              {/* Info */}
              <div>
                <p className="text-white font-semibold text-base leading-tight">
                  {currentImg.menu_item_name ?? `Item #${currentImg.menu_item_id}`}
                </p>
                <p className="text-white/50 text-xs mt-1">
                  Uploaded {new Date(currentImg.uploaded_at).toLocaleDateString()}
                </p>
                {currentImg.reviewed_at && (
                  <p className="text-white/40 text-xs mt-0.5">
                    Approved {new Date(currentImg.reviewed_at).toLocaleDateString()}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  {statusBadge(currentImg.status)}
                  {currentImg.report_count > 0 && (
                    <span className="flex items-center gap-1 text-red-400 text-xs font-bold">
                      <Flag size={11} />
                      {currentImg.report_count}
                    </span>
                  )}
                </div>
              </div>

              <div className="h-px bg-white/10" />

              {/* Actions */}
              {currentImg.status !== 'approved' && (
                <button
                  onClick={() => approveMutation.mutate(currentImg.id)}
                  disabled={approveMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/20 text-green-300 font-semibold text-sm hover:bg-green-500/30 transition-colors disabled:opacity-50"
                >
                  <CheckCircle size={16} />
                  {approveMutation.isPending ? 'Approving…' : 'Approve'}
                </button>
              )}

              <button
                onClick={() => deleteMutation.mutate(currentImg.id)}
                disabled={deleteMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/20 text-red-300 font-semibold text-sm hover:bg-red-500/30 transition-colors disabled:opacity-50"
              >
                <Trash2 size={16} />
                {deleteMutation.isPending ? 'Deleting…' : 'Reject & Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page ── */}
      <div className="p-8 max-w-5xl">
        <div className="mb-6">
          <h2 className="text-2xl font-headline text-on-surface">Image Moderation</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Review customer-submitted photos. Approved images become visible immediately; rejected images are deleted.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-surface-container rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab('pending')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'pending'
                ? 'bg-background text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Clock size={14} />
            Pending
            {pendingImages.length > 0 && (
              <span className="ml-1 min-w-[18px] h-[18px] rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center px-1">
                {pendingImages.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('reported')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'reported'
                ? 'bg-background text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Flag size={14} />
            Reported
            {reportedImages.length > 0 && (
              <span className="ml-1 min-w-[18px] h-[18px] rounded-full bg-error text-on-error text-[10px] font-bold flex items-center justify-center px-1">
                {reportedImages.length}
              </span>
            )}
          </button>
        </div>

        {isLoading && <p className="text-on-surface-variant text-sm">Loading…</p>}

        {!isLoading && images.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant/50">
            {tab === 'pending' ? (
              <>
                <CheckCircle size={40} className="mb-3 opacity-30" />
                <p className="text-sm">No pending images — you're all caught up!</p>
              </>
            ) : (
              <>
                <Flag size={40} className="mb-3 opacity-30" />
                <p className="text-sm">No reported images at this time.</p>
              </>
            )}
          </div>
        )}

        {images.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {images.map((img, idx) => (
              <div
                key={img.id}
                className="bg-surface-container rounded-2xl overflow-hidden border border-outline-variant/10"
              >
                {/* Thumbnail */}
                <div
                  className="w-full h-48 bg-surface-container-high overflow-hidden relative cursor-pointer group"
                  onClick={() => setLightboxIndex(idx)}
                >
                  <img
                    src={resolveImageUrl(img.image_url) ?? undefined}
                    alt="Customer photo"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3'; }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold bg-black/50 px-3 py-1.5 rounded-full">
                      View full size
                    </span>
                  </div>
                  <span className={`absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                    img.status === 'pending' ? 'bg-yellow-400/90 text-yellow-900' :
                    img.status === 'approved' ? 'bg-green-500/90 text-white' :
                    'bg-error/90 text-on-error'
                  }`}>
                    {img.status}
                  </span>
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">
                        {img.menu_item_name ?? `Item #${img.menu_item_id}`}
                      </p>
                      <p className="text-xs text-on-surface-variant/60 mt-0.5">
                        Uploaded {new Date(img.uploaded_at).toLocaleDateString()}
                      </p>
                      {img.reviewed_at && (
                        <p className="text-xs text-on-surface-variant/50 mt-0.5">
                          Approved {new Date(img.reviewed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {img.report_count > 0 && (
                      <div className="flex items-center gap-1 bg-error/10 text-error px-2.5 py-1 rounded-full shrink-0">
                        <Flag size={12} />
                        <span className="text-xs font-bold">{img.report_count}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {img.status !== 'approved' && (
                      <button
                        onClick={() => approveMutation.mutate(img.id)}
                        disabled={approveMutation.isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-xl bg-primary/10 text-primary font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle size={13} />
                        Approve
                      </button>
                    )}

                    {confirmDeleteId === img.id ? (
                      <>
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
                          {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(img.id)}
                        className={`flex items-center justify-center gap-1.5 py-2 text-xs rounded-xl border border-error/30 text-error hover:bg-error/5 transition-colors ${img.status !== 'approved' ? 'flex-1' : 'w-full'}`}
                      >
                        <Trash2 size={13} />
                        {img.status !== 'approved' ? 'Reject' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
