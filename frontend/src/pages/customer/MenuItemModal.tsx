import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Minus, Camera, Flag, ChevronLeft, ChevronRight } from 'lucide-react';
import { menuApi, menuItemImagesApi, MenuItem, Modifier, MenuItemImage, API_ORIGIN } from '../../services/api';
import { useCustomerOrder } from '../../contexts/CustomerOrderContext';
const NOTE_MAX = 50;

interface Props {
  item: MenuItem;
  onClose: () => void;
}

export default function MenuItemModal({ item, onClose }: Props) {
  const { isAyce, addToCart, updateQty, cart } = useCustomerOrder();
  const queryClient = useQueryClient();

  const cartItem = cart.find(i => i.menuItemId === item.id);
  const qty = cartItem?.quantity ?? 0;
  const [note, setNote] = useState(cartItem?.notes ?? '');

  // lightbox: which index is open (null = closed)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // report modal state
  const [reportingImageId, setReportingImageId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportedIds, setReportedIds] = useState<Set<number>>(new Set());

  // upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedForReview, setUploadedForReview] = useState(false);

  // swipe tracking
  const touchStartX = useRef(0);

  const displayPrice = isAyce ? 0 : Number(item.price);

  const { data: modifiers = [] } = useQuery<Modifier[]>({
    queryKey: ['customer-modifiers', item.category_id],
    queryFn: () => menuApi.getModifiers({ category_id: item.category_id }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: userImages = [] } = useQuery<MenuItemImage[]>({
    queryKey: ['user-images', item.id],
    queryFn: () => menuItemImagesApi.getImages(item.id),
    staleTime: 60 * 1000,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => menuItemImagesApi.uploadImage(item.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-images', item.id] });
      setUploadError(null);
      setUploadedForReview(true);
    },
    onError: () => setUploadError('Upload failed. Please try again.'),
  });

  const reportMutation = useMutation({
    mutationFn: ({ imageId, reason }: { imageId: number; reason?: string }) =>
      menuItemImagesApi.reportImage(imageId, reason),
    onSuccess: (_data, { imageId }) => {
      setReportedIds(prev => new Set(prev).add(imageId));
      setReportingImageId(null);
      setReportReason('');
    },
  });

  const goTo = (idx: number) =>
    setExpandedIndex(Math.max(0, Math.min(userImages.length - 1, idx)));

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (reportingImageId !== null) { setReportingImageId(null); return; }
        if (expandedIndex !== null) { setExpandedIndex(null); return; }
        onClose();
      }
      if (expandedIndex !== null) {
        if (e.key === 'ArrowLeft') goTo(expandedIndex - 1);
        if (e.key === 'ArrowRight') goTo(expandedIndex + 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, reportingImageId, expandedIndex, userImages.length]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const mainImageUrl = item.image_url ? `${API_ORIGIN}${item.image_url}` : null;
  const trimmedNote = note.trim() || undefined;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
    e.target.value = '';
  };

  // current image in the lightbox
  const currentImg = expandedIndex !== null ? userImages[expandedIndex] : null;
  const alreadyReported = currentImg ? reportedIds.has(currentImg.id) : false;

  return (
    <>
      {/* ── Lightbox ── */}
      {expandedIndex !== null && currentImg && (
        <div
          className="fixed inset-0 z-[70] flex flex-col"
          style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            if (delta < -50) goTo(expandedIndex + 1);
            else if (delta > 50) goTo(expandedIndex - 1);
          }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
            {/* counter */}
            <span className="text-white/60 text-sm font-medium">
              {expandedIndex + 1} / {userImages.length}
            </span>
            <button
              onClick={() => setExpandedIndex(null)}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* Image + side arrows */}
          <div className="flex-1 flex items-center justify-center relative px-12 min-h-0">
            {/* prev */}
            <button
              onClick={() => goTo(expandedIndex - 1)}
              disabled={expandedIndex === 0}
              className="absolute left-2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-20 active:bg-white/20 transition-colors"
            >
              <ChevronLeft size={22} />
            </button>

            <img
              key={currentImg.id}
              src={`${API_ORIGIN}${currentImg.image_url}`}
              alt="Customer photo"
              className="max-w-full max-h-full object-contain rounded-2xl select-none"
              draggable={false}
            />

            {/* next */}
            <button
              onClick={() => goTo(expandedIndex + 1)}
              disabled={expandedIndex === userImages.length - 1}
              className="absolute right-2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-20 active:bg-white/20 transition-colors"
            >
              <ChevronRight size={22} />
            </button>
          </div>

          {/* Bottom bar: dot indicators + report */}
          <div className="shrink-0 flex items-center justify-between px-4 py-4">
            {/* dot indicators */}
            <div className="flex items-center gap-1.5">
              {userImages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setExpandedIndex(i)}
                  className={`rounded-full transition-all ${
                    i === expandedIndex
                      ? 'w-4 h-2 bg-white'
                      : 'w-2 h-2 bg-white/30'
                  }`}
                />
              ))}
            </div>

            {/* report */}
            <button
              onClick={() => !alreadyReported && setReportingImageId(currentImg.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors
                ${alreadyReported ? 'bg-error text-white' : 'bg-white/10 text-white/70'}`}
            >
              <Flag size={13} />
              {alreadyReported ? 'Reported' : 'Report'}
            </button>
          </div>
        </div>
      )}

      {/* ── Report reason modal ── */}
      {reportingImageId !== null && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setReportingImageId(null)}
        >
          <div
            className="bg-background rounded-2xl p-5 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-on-surface mb-3">Report Image</h3>
            <textarea
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
              placeholder="Optional: describe the problem"
              rows={3}
              className="w-full resize-none bg-surface-container border border-outline-variant/20 rounded-xl px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setReportingImageId(null)}
                className="flex-1 py-2.5 rounded-xl border border-outline-variant/30 text-sm text-on-surface-variant"
              >
                Cancel
              </button>
              <button
                onClick={() => reportMutation.mutate({ imageId: reportingImageId, reason: reportReason.trim() || undefined })}
                disabled={reportMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-error text-on-error text-sm font-bold disabled:opacity-50"
              >
                {reportMutation.isPending ? 'Reporting…' : 'Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main modal ── */}
      <div
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
        style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      >
        <div
          className="relative w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-modal-up"
          onClick={e => e.stopPropagation()}
        >
          {/* Main restaurant image */}
          <div className="relative w-full h-48 bg-surface-container flex items-center justify-center overflow-hidden">
            {mainImageUrl ? (
              <img
                src={mainImageUrl}
                alt={item.name}
                className="w-full h-full object-cover"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <span className="text-7xl opacity-15 select-none">🍣</span>
            )}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="px-5 pt-5 pb-6 overflow-y-auto max-h-[60vh]">
            {/* Name + price */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <h2 className="font-headline text-2xl text-on-surface leading-tight flex-1">
                {item.name}
              </h2>
              <span className={`font-bold text-lg flex-shrink-0 pt-0.5 ${isAyce ? 'text-on-surface-variant opacity-50' : 'text-primary'}`}>
                {isAyce ? 'Included' : `$${displayPrice.toFixed(2)}`}
              </span>
            </div>

            {/* Description */}
            {item.description && (
              <p className="text-sm text-on-surface-variant/75 leading-relaxed mb-4">
                {item.description}
              </p>
            )}

            {/* Customer photos */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/50">
                  Customer Photos {userImages.length > 0 && `(${userImages.length})`}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  className="flex items-center gap-1 text-xs text-primary font-semibold disabled:opacity-50"
                >
                  <Camera size={13} />
                  {uploadMutation.isPending ? 'Uploading…' : 'Add Photo'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {uploadError && (
                <p className="text-xs text-error mb-2">{uploadError}</p>
              )}

              {uploadedForReview && (
                <p className="text-xs text-primary mb-2 font-medium">
                  Your photo has been submitted for review and will appear once approved.
                </p>
              )}

              {userImages.length === 0 && !uploadMutation.isPending ? (
                <p className="text-xs text-on-surface-variant/40 italic">
                  No approved photos yet — be the first to share one!
                </p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
                  {uploadMutation.isPending && (
                    <div className="shrink-0 w-24 h-24 rounded-xl bg-surface-container-high flex items-center justify-center snap-start">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {userImages.map((img, idx) => {
                    const url = `${API_ORIGIN}${img.image_url}`;
                    const alreadyRep = reportedIds.has(img.id);
                    return (
                      <div key={img.id} className="relative shrink-0 w-24 h-24 rounded-xl overflow-hidden snap-start">
                        <img
                          src={url}
                          alt="Customer photo"
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setExpandedIndex(idx)}
                        />
                        <button
                          onClick={e => { e.stopPropagation(); if (!alreadyRep) setReportingImageId(img.id); }}
                          title={alreadyRep ? 'Reported' : 'Report this photo'}
                          className={`absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center shadow
                            ${alreadyRep ? 'bg-error text-white' : 'bg-black/50 text-white'}`}
                        >
                          <Flag size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modifiers */}
            {modifiers.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/50 mb-2">
                  Options & Extras
                </p>
                <div className="space-y-1.5">
                  {modifiers.map(mod => (
                    <div
                      key={mod.id}
                      className="flex items-center justify-between px-3 py-2.5 bg-surface-container-lowest rounded-xl border border-outline-variant/10"
                    >
                      <div>
                        <p className="text-sm font-medium text-on-surface">{mod.name}</p>
                        {mod.description && (
                          <p className="text-xs text-on-surface-variant/60 mt-0.5">{mod.description}</p>
                        )}
                      </div>
                      {mod.price > 0 && (
                        <span className="text-sm font-bold text-primary flex-shrink-0 ml-2">
                          +${Number(mod.price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom note */}
            <div className="mb-5">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                Custom Note <span className="font-normal normal-case tracking-normal opacity-70">(optional)</span>
              </label>
              <div className="relative">
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))}
                  placeholder="e.g. no wasabi, extra spicy…"
                  rows={2}
                  className="w-full resize-none bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-3.5 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 transition-colors"
                />
                {note.length > 0 && (
                  <span className="absolute bottom-2 right-3 text-[10px] text-on-surface-variant/40">
                    {note.length}/{NOTE_MAX}
                  </span>
                )}
              </div>
            </div>

            {/* Add to cart */}
            <div className="flex items-center gap-3">
              {qty === 0 ? (
                <button
                  onClick={() => addToCart(item.id, item.name, Number(item.price), trimmedNote)}
                  className="flex-1 py-3.5 bg-primary text-on-primary font-bold text-sm uppercase tracking-[0.15em] rounded-xl active:scale-[0.98] transition-transform"
                >
                  Add to Order
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-surface-container rounded-xl px-3 py-2">
                    <button
                      onClick={() => updateQty(item.id, qty - 1)}
                      className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center font-bold text-on-surface">{qty}</span>
                    <button
                      onClick={() => addToCart(item.id, item.name, Number(item.price), trimmedNote)}
                      className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <button
                    onClick={onClose}
                    className="flex-1 py-3.5 bg-primary text-on-primary font-bold text-sm uppercase tracking-[0.15em] rounded-xl active:scale-[0.98] transition-transform"
                  >
                    Done · {qty} added
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
