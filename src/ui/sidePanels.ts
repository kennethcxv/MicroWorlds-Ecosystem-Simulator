/** Left water-quality + habitat-score panel, and right population + info panel. */
import { type GameState, getActiveTank } from "../core/state";
import type { Component, Controller } from "./controller";
import { el, clear } from "../utils/dom";
import { icon } from "./icons";
import { readAllMetrics, type MetricReading } from "../data/water";
import { decorationCount } from "../core/sim";
import { SPECIES } from "../data/species";
import { ASSETS } from "../data/assets";

const METRIC_ICON: Record<string, string> = {
  oxygen: "droplet",
  temperature: "thermometer",
  ph: "flask",
  ammonia: "molecule",
  nitrite: "molecule",
  nitrate: "molecule",
};

function section(title: string, extra?: HTMLElement): HTMLElement {
  return el("div", { class: "panel-section-head" }, [
    el("span", { class: "panel-section-title", text: title }),
    ...(extra ? [extra] : []),
  ]);
}

interface MetricRow {
  el: HTMLElement;
  update(r: MetricReading): void;
}

function metricRow(key: string): MetricRow {
  const label = el("span", { class: "metric-label" });
  const status = el("span", { class: "metric-status" });
  const value = el("span", { class: "metric-value" });
  const fill = el("span", { class: "bar-fill" });
  const bar = el("span", { class: "bar" }, [fill]);
  const root = el("div", { class: "metric-row" }, [
    el("span", { class: "metric-ico", html: icon(METRIC_ICON[key] ?? "molecule") }),
    el("div", { class: "metric-body" }, [
      el("div", { class: "metric-top" }, [label, value]),
      status,
      bar,
    ]),
  ]);
  return {
    el: root,
    update(r) {
      label.textContent = r.def.label;
      const dec = r.def.decimals;
      value.textContent = `${r.value.toFixed(dec)}${r.def.unit ? " " + r.def.unit : ""}`;
      status.textContent = r.status;
      fill.style.width = `${Math.round(r.goodness * 100)}%`;
      root.dataset.tone = r.tone;
    },
  };
}

export function createLeftPanel(controller: Controller): Component {
  const tankName = el("span", { class: "tank-name" });
  const tankType = el("div", { class: "tank-type" });
  const pencil = el("button", { class: "icon-btn tiny", title: "Rename tank", html: icon("pencil") });
  pencil.addEventListener("click", () => controller.toast("Renaming tanks is coming soon.", "info"));

  const rows = readAllMetrics(getActiveTank(controller.state).water).map((r) => metricRow(r.def.key));

  const scoreNum = el("div", { class: "score-num" });
  const scoreWord = el("div", { class: "score-word" });
  const segWrap = el("div", { class: "score-segs" });
  const segs: HTMLElement[] = [];
  for (let i = 0; i < 6; i++) {
    const s = el("span", { class: "seg" });
    segs.push(s);
    segWrap.append(s);
  }
  const detailsBtn = el("button", { class: "row-btn", onClick: () => controller.navigate("ecocenter") }, [
    el("span", { text: "View Habitat Details" }),
    el("span", { class: "chev", html: icon("chevron") }),
  ]);

  const root = el("aside", { class: "panel panel-left" }, [
    el("div", { class: "panel-head" }, [
      el("div", { class: "tank-title" }, [tankName, pencil]),
      tankType,
    ]),
    el("div", { class: "panel-block" }, [
      section("WATER QUALITY", el("span", { class: "head-ico", html: icon("info") })),
      el("div", { class: "metric-list" }, rows.map((r) => r.el)),
    ]),
    el("div", { class: "panel-block habitat-block" }, [
      section("HABITAT SCORE"),
      el("div", { class: "score-row" }, [
        el("span", { class: "score-ico", html: icon("habitat") }),
        scoreNum,
        el("div", { class: "score-meta" }, [scoreWord, segWrap]),
      ]),
      detailsBtn,
    ]),
  ]);

  return {
    el: root,
    update(state: GameState) {
      const tank = getActiveTank(state);
      tankName.textContent = tank.name;
      tankType.textContent = tank.habitatType;
      const readings = readAllMetrics(tank.water);
      readings.forEach((r, i) => rows[i]?.update(r));

      const score = Math.round(tank.habitatScore);
      scoreNum.textContent = String(score);
      const tone = score >= 82 ? "good" : score >= 60 ? "warn" : "bad";
      const word = score >= 88 ? "Excellent" : score >= 75 ? "Thriving" : score >= 60 ? "Stable" : score >= 40 ? "Struggling" : "Critical";
      scoreWord.textContent = word;
      root.querySelector(".habitat-block")?.setAttribute("data-tone", tone);
      const filled = Math.round((score / 100) * segs.length);
      segs.forEach((s, i) => s.classList.toggle("on", i < filled));
    },
  };
}

export function createRightPanel(controller: Controller): Component {
  const popList = el("div", { class: "pop-list" });
  const viewAll = el("button", { class: "row-btn", onClick: () => controller.navigate("shop") }, [
    el("span", { text: "View All Species" }),
    el("span", { class: "chev", html: icon("chevron") }),
  ]);

  const infoList = el("div", { class: "info-list" });

  const root = el("aside", { class: "panel panel-right" }, [
    el("div", { class: "panel-block" }, [
      section("POPULATION"),
      popList,
      viewAll,
    ]),
    el("div", { class: "panel-block" }, [
      section("HABITAT INFO"),
      infoList,
    ]),
  ]);

  const infoRow = (iconName: string, label: string, value: string, tone?: string) =>
    el("div", { class: "info-row", dataset: tone ? { tone } : {} }, [
      el("span", { class: "info-ico", html: icon(iconName) }),
      el("span", { class: "info-label", text: label }),
      el("span", { class: "info-value", text: value }),
    ]);

  return {
    el: root,
    update(state: GameState) {
      const tank = getActiveTank(state);

      clear(popList);
      const sorted = [...tank.populations].sort((a, b) => b.count - a.count).slice(0, 5);
      for (const p of sorted) {
        const s = SPECIES[p.speciesId];
        if (!s) continue;
        const url = ASSETS.creatures[s.asset as keyof typeof ASSETS.creatures];
        const thumb = el("span", { class: `pop-thumb type-${s.type}` });
        const img = document.createElement("img");
        img.src = url;
        img.alt = s.name;
        img.loading = "lazy";
        thumb.append(img);
        popList.append(
          el("div", { class: "pop-row" }, [
            thumb,
            el("div", { class: "pop-text" }, [
              el("div", { class: "pop-name", text: s.name }),
              el("div", { class: "pop-latin", text: s.latin }),
            ]),
            el("span", { class: "pop-count", text: String(p.count) }),
          ]),
        );
      }

      clear(infoList);
      infoList.append(
        infoRow("tankSize", "Tank Size", `${tank.sizeLiters} L`),
        infoRow("filter", "Filtration", tank.filtration, ratingTone(tank.filtration)),
        infoRow("bulb", "Lighting", tank.lighting, ratingTone(tank.lighting)),
        infoRow("decor", "Decorations", `${decorationCount(tank)} Items`),
      );
    },
  };
}

function ratingTone(r: string): string {
  return r === "Optimal" || r === "Excellent" ? "good" : r === "Good" ? "warn" : "";
}
