export const COMIN_UI = {
  background: "#F6F3ED",

  nodes: {
    context: {
      color: "#294C60",
      size: 18,
    },
    contextSemantic: {
      color: "#8A7A68",
      size: 9,
    },
    post: {
      color: "#C96F4A",
      borderColor: "#1F3442",
      size: 10,
    },
    source: {
      color: "#6F8F78",
      size: 8,
    },
    structuralSource: {
      color: "#9A9185",
      borderColor: "#544B43",
      size: 8,
    },
  },

  edges: {
    related: {
      color: "#BFC4C7",
      size: 2,
    },
    supportedByPost: {
      color: "#A99080",
      size: 2,
    },
    hasContextChild: {
      color: "#9A9185",
      size: 2,
    },
    hasSource: {
      color: "#8FA397",
      size: 1,
    },
    containsSource: {
      color: "#B0A79A",
      size: 0.7,
    },
  },
} as const;
