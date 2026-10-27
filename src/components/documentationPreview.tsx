import { MarkdownRenderer } from "@sunaissu/document-editor";
import { NoteboardPreview } from "@sunaissu/noteboard";
import { parseDocumentation } from "../util/documentation";

export default function DocumentationPreview({ value }: { value: string }) {
  const content = parseDocumentation(value);
  if (!content) return <p role="alert">This documentation cannot be previewed. Its source remains available.</p>;
  return <article className="documentation-readonly" aria-label="Documentation preview">
    {content.sections.map(section => <section key={section.id}>
      {section.title && <h3>{section.title}</h3>}
      {section.type === "text" ? <MarkdownRenderer content={section.content} openLinksInNewTab /> : <figure>
        <NoteboardPreview elements={section.elements} height={Math.min(section.height, 420)} />
        {section.caption && <figcaption>{section.caption}</figcaption>}
      </figure>}
    </section>)}
    {!content.sections.length && <p>No sections yet.</p>}
  </article>;
}
