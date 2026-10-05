import { FC } from "react";

import { GraphSearchSelection } from "../../components/GraphSearchSelection";
import { Layout } from "../layout";
import { Header } from "../layout/Header";
import { GraphRendering } from "./GraphRendering";

export const GraphPage: FC = () => {
  return (
    <>
      <Header />

      <Layout
        id="graph-page"
        className="panels-layout"
      >
        {/* Seule la recherche conserve un panneau latéral. */}
        <div className="panel panel-left panel-main">
          <div className="panel-body">
            <GraphSearchSelection />
          </div>
        </div>

        <div className="filler">
          <GraphRendering />
        </div>
      </Layout>
    </>
  );
};
