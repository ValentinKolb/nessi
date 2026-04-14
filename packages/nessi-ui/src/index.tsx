import { render } from "solid-js/web";
import { appBoot } from "./app/boot/init.js";
import { App } from "./app/shell/App.js";
import "./styles/global.css";

const main = async () => {
  await appBoot.init();
  render(() => <App />, document.getElementById("app")!);
};

void main();
