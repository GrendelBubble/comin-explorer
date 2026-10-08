import { FC, useState } from "react";

import { GraphSearchSelection } from "../../components/GraphSearchSelection";
import type { CominDeepSearchTarget } from "../../core/comin/deepSearch";
import { Layout } from "../layout";
import { GraphRendering } from "./GraphRendering";

export const GraphPage: FC = () => {
  const [isSearchOpen, setIsSearchOpen] = useState(true);
  const [
    searchPreviewItem,
    setSearchPreviewItem,
  ] = useState<CominDeepSearchTarget | null>(
    null,
  );

  return (
    <Layout
      id="graph-page"
      className={`panels-layout ${
        isSearchOpen ? "comin-search-open" : ""
      }`}
    >
      <div
        className={`panel panel-left panel-main panel-expandable ${
          isSearchOpen ? "deployed" : ""
        }`}
      >
        <div className="panel-body">
          <GraphSearchSelection
            onPreviewChange={
              setSearchPreviewItem
            }
          />
        </div>
      </div>

      <button
        type="button"
        className="comin-search-toggle"
        onClick={() => {
          setIsSearchOpen(
            (open) => {
              if (open) {
                setSearchPreviewItem(
                  null,
                );
              }

              return !open;
            },
          );
        }}
        aria-label={
          isSearchOpen
            ? "Fermer la recherche"
            : "Ouvrir la recherche"
        }
        title={
          isSearchOpen
            ? "Fermer la recherche"
            : "Ouvrir la recherche"
        }
      >
        {isSearchOpen ? "‹" : "›"}
      </button>

      <div className="filler">
        <GraphRendering
          searchPreviewItem={
            searchPreviewItem
          }
        />
      </div>
    </Layout>
  );
};
