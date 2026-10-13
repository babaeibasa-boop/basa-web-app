/**
 * Reftek web-app catalog.
 *
 * - dynamic: `url` is used directly when the user launches the app
 * - dynamic: backend calls `resolveUrl` and expects `{ status: "OK", data: { app_user_url } }`
 *
 * Edit this file to add/remove apps. `appId` must be unique.
 * `categorySlug` must match a row in the `categories` table.
 */
export type ReftekLinkType = "dynamic" | "dynamic";

export interface ReftekAppDefinition {
  webAppId: number|string;
  appId: string;
  name: string;
  categorySlug: string;
  /**
   * Icon shown on the frontend:
   * - Lucide name (e.g. "Users") — must exist in ReftekPage ICON_MAP
   * - Static image path under frontend/public (e.g. "/reftek-icons/hooshan.png")
   * - Absolute image URL (e.g. "https://cdn.example.com/logo.png")
   */
  icon: string;
  description?: string;
  sortOrder?: number;
  linkType: ReftekLinkType;
  /** Required when linkType is "dynamic" */
  url?: string;
  /** Required when linkType is "dynamic" — absolute URL our backend will call */
  resolveUrl?: string;
}

export const REFTEK_APPS: ReftekAppDefinition[] = [
  {
    appId: "hooshan",
    webAppId: 21,
    name: "هوشان",
    categorySlug: "ai",
    icon: "/reftek-icons/hooshan.webp",
    sortOrder: 1,
    linkType: "dynamic",
    url: "https://houshan.ai/",
  },
  {
    appId: "game-center",
    webAppId: 22,
    name: "گیم سنتر",
    categorySlug: "mobile-apps-games",
    icon: "/reftek-icons/game-center.webp",
    sortOrder: 1,
    linkType: "dynamic",
    url: "https://irangamecenter.com/",
  },
  {
    appId: "limoomi",
    webAppId: 51,
    name: "لیمومی",
    categorySlug: "health-sports",
    icon: "/reftek-icons/limoomi.png",
    sortOrder: 1,
    linkType: "dynamic",
    url: "https://limoome.com/",
  },
  {
    appId: "fitamin",
    webAppId: 50,
    name: "فیتامین",
    categorySlug: "health-sports",
    icon: "/reftek-icons/fitamin.svg",
    sortOrder: 2,
    linkType: "dynamic",
    url: "https://fitamin.ir/",
  },
  {
    appId: "aramia",
    webAppId: 49,
    name: "آرامیا",
    categorySlug: "health-sports",
    icon: "/reftek-icons/aramia.png",
    sortOrder: 3,
    linkType: "dynamic",
    url: "https://aramia.me/",
  },
  {
    appId: "zaban-master",
    webAppId: 47,
    name: "زبان مستر",
    categorySlug: "education",
    icon: "/reftek-icons/zaban-master.png",
    sortOrder: 1,
    linkType: "dynamic",
    url: "https://zabanmaster.com/",
  },
  {
    appId: "fixa",
    webAppId: 48,
    name: "فیکسا",
    categorySlug: "home-services",
    icon: "/reftek-icons/fixa.svg",
    sortOrder: 1,
    linkType: "dynamic",
    url: "https://fixa24.com/",
  },
  {
    appId: "chekida",
    webAppId: 59,
    name: "چکیدا",
    categorySlug: "books",
    icon: "/reftek-icons/chekida.svg",
    sortOrder: 1,
    linkType: "dynamic",
    url: "https://fixa24.com/",
  },
  {
    appId: "aia-plus",
    webAppId: 19,
    name: "آیا پلاس",
    categorySlug: "ai",
    icon: "/reftek-icons/aia-plus.png",
    sortOrder: 2,
    linkType: "dynamic",
    url: "https://aiaplus.com/",
  },
];
