import { NoteReaderFrame } from "./NoteReaderFrame";
import { FC, useEffect, useState } from "react";

import { fetchCominContextChildrenGraph } from "../../core/comin/api";
import { CominContextSemanticNode } from "../../core/comin/contextChildrenGraph";

interface ContextSemanticReaderProps {
  item: CominContextSemanticNode | null;
  onClose: () => void;
}

export const ContextSemanticReader: FC<
  ContextSemanticReaderProps
> = ({ item, onClose }) => {
  const [current, setCurrent] = useState<CominContextSemanticNode | null>(null);
  const [sections, setSections] = useState<CominContextSemanticNode[]>([]);

  useEffect(() => {
    setCurrent(item);
    setSections([]);
    if (!item) return;
    let active = true;
    fetchCominContextChildrenGraph(item.theme_id)
      .then((data) => {
        if (active) setSections(data.nodes.filter(
          (node): node is CominContextSemanticNode =>
            node.type === "context_semantic",
        ));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [item]);

  useEffect(() => {
    if (item === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [item, onClose]);

  if (item === null) return null;

  const rawUnits: unknown = current?.units ?? item.units;
  let units: CominContextSemanticNode["units"] = [];

  if (Array.isArray(rawUnits)) {
    units = rawUnits as CominContextSemanticNode["units"];
  } else if (typeof rawUnits === "string") {
    try {
      const parsed = JSON.parse(rawUnits);

      if (Array.isArray(parsed)) {
        units =
          parsed as CominContextSemanticNode["units"];
      }
    } catch {
      units = [];
    }
  }

  return (
    <NoteReaderFrame label={item.label} onClose={onClose}>
        <h1>{current?.label ?? item.label}</h1>
        <nav aria-label="Autres notes du contexte" className="d-flex flex-wrap gap-3 mt-3">
          {sections
            .filter((section) => section.semantic_kind !== (current?.semantic_kind ?? item.semantic_kind))
            .map((section) => (
              <button
                key={section.semantic_kind}
                type="button"
                className="btn btn-link p-0"
                onClick={() => {
                  setCurrent(section);
                  document.querySelector("[aria-modal=true] article")?.scrollTo({ top: 0 });
                }}
              >
                {section.label}
              </button>
            ))}
        </nav>

        <div className="d-flex flex-column gl-gap-4 mt-4">
          {units.map((unit) => (
            <p key={unit.unit_id} className="m-0">
              {unit.text}
            </p>
          ))}
        </div>
    </NoteReaderFrame>
  );
};
