/**
 * In-app replacements for confirm(), prompt() and alert(), plus toasts with Undo.
 * The DialogHost component renders them; these functions can be called from anywhere.
 */

export interface DialogAction {
  label: string;
  value: string;
  style?: 'primary' | 'danger' | 'cancel' | 'default';
}

export interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  input?: { initial: string; placeholder?: string; label: string };
  actions: DialogAction[];
  resolve: (value: string | null, text?: string) => void;
}

export interface ToastRequest {
  id: number;
  message: string;
  undo?: () => void | Promise<void>;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let nextId = 1;
export const store: { dialog: DialogRequest | null; toast: ToastRequest | null } = { dialog: null, toast: null };

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const emit = () => listeners.forEach((l) => l());

export function closeDialog(value: string | null, text?: string) {
  const d = store.dialog;
  if (!d) return;
  store.dialog = null;
  emit();
  d.resolve(value, text);
}

function open(req: Omit<DialogRequest, 'id' | 'resolve'>) {
  return new Promise<{ value: string | null; text?: string }>((resolve) => {
    if (store.dialog) store.dialog.resolve(null);
    store.dialog = { ...req, id: nextId++, resolve: (value, text) => resolve({ value, text }) };
    emit();
  });
}

/** Ask before something that can't be undone. Resolves true when confirmed. */
export async function confirmDialog(o: { title: string; message?: string; confirmLabel: string; danger?: boolean; cancelLabel?: string }) {
  const r = await open({
    title: o.title,
    message: o.message,
    actions: [
      { label: o.cancelLabel ?? 'Cancel', value: 'cancel', style: 'cancel' },
      { label: o.confirmLabel, value: 'ok', style: o.danger ? 'danger' : 'primary' },
    ],
  });
  return r.value === 'ok';
}

/** Ask for a short piece of text. Resolves null when cancelled. */
export async function promptDialog(o: { title: string; message?: string; label: string; initial?: string; placeholder?: string; confirmLabel: string }) {
  const r = await open({
    title: o.title,
    message: o.message,
    input: { initial: o.initial ?? '', placeholder: o.placeholder, label: o.label },
    actions: [
      { label: 'Cancel', value: 'cancel', style: 'cancel' },
      { label: o.confirmLabel, value: 'ok', style: 'primary' },
    ],
  });
  return r.value === 'ok' ? (r.text ?? '').trim() || null : null;
}

/** Choose between several actions. Resolves the chosen value, or null when cancelled. */
export async function choiceDialog(o: { title: string; message?: string; actions: DialogAction[] }) {
  const r = await open({ title: o.title, message: o.message, actions: o.actions });
  return r.value === 'cancel' ? null : r.value;
}

let toastTimer = 0;
/** A short message at the bottom of the screen, optionally with Undo. Disappears after a few seconds. */
export function toast(message: string, opts: { undo?: () => void | Promise<void>; ms?: number } = {}) {
  window.clearTimeout(toastTimer);
  store.toast = { id: nextId++, message, undo: opts.undo };
  emit();
  toastTimer = window.setTimeout(dismissToast, opts.ms ?? (opts.undo ? 6000 : 3500));
}

export function dismissToast() {
  window.clearTimeout(toastTimer);
  if (!store.toast) return;
  store.toast = null;
  emit();
}
