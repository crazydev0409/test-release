const { readFileSync } = require("fs");
const StyleDictionary = require("style-dictionary");
const {
  registerTransforms,
  permutateThemes,
} = require("@tokens-studio/sd-transforms");

registerTransforms(StyleDictionary);

const removeNonNumeric = (str) => Number(str.replace(/[^0-9.]/g, ""));
const formatBoxShadow = ({ x, y, blur, spread, color }) =>
  `${x}px ${y}px ${blur}px ${removeNonNumeric(spread)}px ${color}`;

const registerTransform = (type, name, matcher, transformer) =>
  StyleDictionary.registerTransform({
    type,
    name,
    matcher,
    transformer,
    transitive: true,
  });
const specifySelector = (selector) => {
  const selectorMap = {
    dark: ".dark",
    light: ":root .light",
    attendee: ".attendee",
    mutable: ".dark",
  };

  for (let key in selectorMap) {
    if (selector.includes(key)) {
      return selectorMap[key];
    }
  }

  return null;
};

const transforms = [
  [
    "value",
    "figmaCalc",
    ({ value }) => typeof value === "string" && value.includes("*"),
    ({ value }) => {
      const optimizeNumber = (num) =>
        Math.round(Math.round(num * 100) / 10) / 10;
      const [a, b] = value.split("*").map(removeNonNumeric);
      return `${optimizeNumber(a * b)}px`;
    },
  ],
  [
    "value",
    "heightPercent",
    ({ value }) => typeof value === "string" && value.includes("%"),
    (props) =>
      props?.type === "lineHeights" ? props?.description : props.value,
  ],
  [
    "value",
    "contentTypography",
    ({ type }) => type === "typography",
    ({ value }) => {
      const { fontSize, lineHeight, fontFamily } = value;
      return fontSize && lineHeight && fontFamily
        ? `400 ${fontSize}/${lineHeight} ${fontFamily}`
        : undefined;
    },
  ],
  [
    "value",
    "contentBoxShadow",
    ({ type }) => type === "boxShadow",
    ({ value }) =>
      value &&
      (Array.isArray(value)
        ? value.map(formatBoxShadow).join(", ")
        : formatBoxShadow(value)),
  ],
];

transforms.forEach((args) => registerTransform(...args));

StyleDictionary.registerTransformGroup({
  name: "customCss",
  transforms: StyleDictionary.transformGroup["css"].concat([
    "heightPercent",
    "figmaCalc",
    "attribute/cti",
    "name/cti/kebab",
    "time/seconds",
    "content/icon",
    "color/css",
    "contentTypography",
    "contentBoxShadow",
  ]),
});

const excludedFiles = [
  "json/semantics/color",
  "json/semantics/color attendee",
  "json/semantics/color mutable",
];

const themes = permutateThemes(
  JSON.parse(readFileSync("json/$themes.json", "utf-8")),
  { seperator: "_" }
);

Object.entries(themes)
  .map(([name, tokensets]) => ({
    source: tokensets.map((tokenset) => `json/${tokenset}.json`),
    platforms: {
      css: {
        transformGroup: "customCss",
        prefix: "my",
        buildPath: `css/`,
        files: tokensets.map((tokenset) => ({
          destination: `${tokenset}.css`,
          format: "css/variables",
          filter: (token) =>
            token.filePath.split(".json")[0] === `json/${tokenset}`,
          options: {
            outputReferences: excludedFiles.some((filePath) =>
              filePath.includes(tokenset)
            ),
            selector: specifySelector(tokenset),
          },
        })),
      },
    },
  }))
  .forEach((cfg) => {
    const sd = StyleDictionary.extend(cfg);
    sd.cleanAllPlatforms();
    sd.buildAllPlatforms();
  });
