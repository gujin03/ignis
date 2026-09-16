import bridgeCss from "@ignis/bridge/styles.css";

export function installCssOverrides() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/assets/overrides.css";
  link.setAttribute("data-ignis", "css-overrides");
  document.head.appendChild(link);

  const bridgeStyle = document.createElement("style");
  bridgeStyle.textContent = bridgeCss;
  bridgeStyle.setAttribute("data-ignis", "bridge-css");
  document.head.appendChild(bridgeStyle);
}
