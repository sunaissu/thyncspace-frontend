import { createContext, Dispatch, SetStateAction } from "react";
import { Note } from "../model/note";

const NoteContext = createContext<{
  notes: Note[];
  setNotes: Dispatch<SetStateAction<Note[]>>;
}>({
  notes: [],
  setNotes: () => {},
});

export default NoteContext;
