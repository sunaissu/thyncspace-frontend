import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as Y from "yjs";
import {
  DOCUMENTATION_ORDER_KEY, DOCUMENTATION_SECTIONS_KEY,
  createDocumentationSection, documentationSectionId, documentationOrder,
  parseDocumentation, readDocumentation, writeDocumentationSection, previewDocumentationHistory,
  type DocumentationContent, type DocumentationSection,
} from "../util/documentation";

export function useDocumentation(document: Y.Doc) {
  const metadata = useMemo(() => document.getMap<Y.Map<unknown>>(DOCUMENTATION_SECTIONS_KEY), [document]);
  const order = useMemo(() => document.getArray<string>(DOCUMENTATION_ORDER_KEY), [document]);
  const origin = useMemo(() => ({ source: "documentation-structure", document }), [document]);
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<Y.UndoManager | null>(null);
  const [, setHistoryRevision] = useState(0);
  const subscribe = useCallback((notify: () => void) => {
    document.on("afterTransaction", notify);
    return () => document.off("afterTransaction", notify);
  }, [document]);
  const getSnapshot = useCallback(() => {
    try { return JSON.stringify(readDocumentation(document)); }
    catch (error) { return `!${error instanceof Error ? error.message : "This documentation could not be read."}`; }
  }, [document]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const content = useMemo(() => snapshot.startsWith("!") ? null : JSON.parse(snapshot) as DocumentationContent, [snapshot]);
  const error = snapshot.startsWith("!") ? snapshot.slice(1) : "";

  useEffect(() => {
    const manager = new Y.UndoManager([metadata, order], { trackedOrigins: new Set([origin]), captureTimeout: 500 });
    const changed = () => setHistoryRevision(value => value + 1);
    manager.on("stack-item-added", changed); manager.on("stack-item-popped", changed); manager.on("stack-cleared", changed);
    setHistory(manager);
    return () => { manager.destroy(); };
  }, [metadata, order, origin]);

  const replace = useCallback((value: unknown): boolean => {
    const next = parseDocumentation(value);
    if (!next) { setNotice("This copy could not be restored. Check its format and the 1 MiB limit."); return false; }
    document.transact(() => {
      const ids = new Set(next.sections.map(section => section.id));
      for (const id of metadata.keys()) if (!ids.has(id)) metadata.delete(id);
      for (const section of next.sections) writeDocumentationSection(document, section);
      order.delete(0, order.length);
      if (next.sections.length) order.insert(0, next.sections.map(section => section.id));
    }, "documentation-replace");
    history?.clear(); setNotice(""); return true;
  }, [document, metadata, order, history]);

  const seed = useCallback((value: unknown): boolean => {
    if (metadata.size || order.length) return false;
    return replace(value);
  }, [metadata, order, replace]);

  const admit = useCallback((next: DocumentationContent): boolean => {
    if (!parseDocumentation(next)) { setNotice("That change would exceed 40 sections or 1 MiB, or contains an unsupported diagram object. Your current work is unchanged."); return false; }
    setNotice(""); return true;
  }, []);

  const acceptSection = useCallback((id: string, changes: Partial<DocumentationSection>, conservativeExtra = ""): boolean => {
    try {
      const current = readDocumentation(document);
      if (!current.sections.some(section => section.id === id)) { setNotice("This section was removed by another editor."); return false; }
      const candidate = { ...current, sections: current.sections.map(section => section.id === id ? { ...section, ...changes, id, type: section.type } as DocumentationSection : section) };
      if (conservativeExtra && new TextEncoder().encode(JSON.stringify(candidate) + conservativeExtra).byteLength > 1024 * 1024) {
        setNotice("This document is close to 1 MiB. Wait for the latest edits, then try a smaller change."); return false;
      }
      return admit(candidate);
    } catch (failure) { setNotice(failure instanceof Error ? failure.message : "This section could not be changed."); return false; }
  }, [document, admit]);

  const updateMetadata = useCallback((id: string, changes: { title?: string; caption?: string; height?: number }): boolean => {
    if (!acceptSection(id, changes)) return false;
    const section = metadata.get(id); if (!section) return false;
    document.transact(() => { for (const [key, value] of Object.entries(changes)) section.set(key, value); }, origin);
    return true;
  }, [acceptSection, document, metadata, origin]);

  const insert = useCallback((type: "text" | "board", afterId?: string, copy?: DocumentationSection): string | null => {
    try {
      const current = readDocumentation(document);
      const section = copy ? { ...structuredClone(copy), id: documentationSectionId(), title: copy.title ? `${copy.title.slice(0, 113)} (copy)` : "Copy" } : createDocumentationSection(type, type === "text" ? "Text section" : "Diagram");
      const index = afterId ? current.sections.findIndex(item => item.id === afterId) + 1 : current.sections.length;
      const sections = [...current.sections]; sections.splice(index, 0, section);
      if (!admit({ ...current, sections })) return null;
      history?.stopCapturing();
      document.transact(() => {
        writeDocumentationSection(document, section);
        const rawOrder = order.toArray();
        const anchor = afterId ? rawOrder.lastIndexOf(afterId) + 1 : order.length;
        order.insert(anchor, [section.id]);
      }, origin);
      history?.stopCapturing(); return section.id;
    } catch (failure) { setNotice(failure instanceof Error ? failure.message : "This section could not be added."); return null; }
  }, [document, admit, history, order, origin]);

  const duplicate = useCallback((id: string) => {
    try { const section = readDocumentation(document).sections.find(item => item.id === id); return section ? insert(section.type, id, section) : null; }
    catch { return null; }
  }, [document, insert]);

  const remove = useCallback((id: string): boolean => {
    if (!metadata.has(id)) return false;
    history?.stopCapturing();
    document.transact(() => {
      metadata.delete(id);
      const ids = order.toArray();
      for (let index = ids.length - 1; index >= 0; index--) if (ids[index] === id) order.delete(index, 1);
    }, origin);
    history?.stopCapturing(); setNotice("Section removed. Use Undo section change to restore it."); return true;
  }, [document, metadata, order, origin, history]);

  const move = useCallback((id: string, direction: -1 | 1): boolean => {
    const ids = documentationOrder(order.toArray(), metadata.keys()), from = ids.indexOf(id), target = ids[from + direction];
    if (from < 0 || !target) return false;
    history?.stopCapturing();
    document.transact(() => {
      const raw = order.toArray();
      for (let index = raw.length - 1; index >= 0; index--) if (raw[index] === id) order.delete(index, 1);
      const targetIndex = order.toArray().indexOf(target);
      order.insert(targetIndex < 0 ? order.length : targetIndex + (direction > 0 ? 1 : 0), [id]);
    }, origin);
    history?.stopCapturing(); return true;
  }, [document, metadata, order, history, origin]);

  const applyHistory = useCallback((action: "undo" | "redo") => {
    if (!history) return;
    try {
      previewDocumentationHistory(document, history, action);
      history[action](); setNotice("");
    } catch {
      setNotice(`This ${action} would exceed 40 sections or 1 MiB with the latest edits. Your current work is unchanged.`);
    }
  }, [document, history]);
  const undo = useCallback(() => applyHistory("undo"), [applyHistory]);
  const redo = useCallback(() => applyHistory("redo"), [applyHistory]);
  const canUndo = Boolean(history?.undoStack.length);
  const canRedo = Boolean(history?.redoStack.length);
  return {
    content, value: content ? snapshot : "", error, notice,
    ready: Boolean(content), seed, replace, insert, duplicate, remove, move,
    updateMetadata, acceptSection, undo, redo, canUndo, canRedo,
  };
}
