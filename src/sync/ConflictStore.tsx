import React, { createContext, useContext, useState } from 'react';

export interface ConflictField {
  field: string;
  localValue: string;
  sheetValue: string;
}

export interface ConflictItem {
  id: string;          // e.g. memberId or txnId
  table: string;       // "members" | "membershipRows" | "transactions"
  fields: ConflictField[];
  /** Call to resolve: true = keep local, false = take sheet value per field */
  resolve: (decisions: Record<string, 'local' | 'sheet'>) => void;
}

interface ConflictState {
  conflicts: ConflictItem[];
  addConflict: (c: ConflictItem) => void;
  removeConflict: (id: string) => void;
}

const ConflictContext = createContext<ConflictState | null>(null);

export function ConflictProvider({ children }: { children: React.ReactNode }) {
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);

  const addConflict = (c: ConflictItem) =>
    setConflicts((prev) => {
      const filtered = prev.filter((x) => x.id !== c.id);
      return [...filtered, c];
    });

  const removeConflict = (id: string) =>
    setConflicts((prev) => prev.filter((x) => x.id !== id));

  return (
    <ConflictContext.Provider value={{ conflicts, addConflict, removeConflict }}>
      {children}
    </ConflictContext.Provider>
  );
}

export function useConflicts() {
  const ctx = useContext(ConflictContext);
  if (!ctx) throw new Error('useConflicts must be inside <ConflictProvider>');
  return ctx;
}
