/**
 * Reftek web-app catalog.
 *
 * - static: `url` is used directly when the user launches the app
 * - dynamic: backend calls `resolveUrl` and expects a JSON body with a launch URL
 *   at `url`, `data.url`, or `data.launch_url`
 *
 * Edit this file to add/remove apps. `appId` must be unique.
 * `categorySlug` must match a row in the `categories` table.
 */
export type ReftekLinkType = "static" | "dynamic";

export interface ReftekAppDefinition {
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
  /** Required when linkType is "static" */
  url?: string;
  /** Required when linkType is "dynamic" — absolute URL our backend will call */
  resolveUrl?: string;
}

export const REFTEK_APPS: ReftekAppDefinition[] = [
  {
    appId: "hooshan",
    name: "هوشان",
    categorySlug: "ai",
    icon: "/reftek-icons/hooshan.webp",
    sortOrder: 1,
    linkType: "static",
    url: "https://houshan.ai/",
  },
  {
    appId: "game-center",
    name: "گیم سنتر",
    categorySlug: "mobile-apps-games",
    icon: "/reftek-icons/game-center.webp",
    sortOrder: 1,
    linkType: "static",
    url: "https://irangamecenter.com/",
  },
  {
    appId: "limoomi",
    name: "لیمومی",
    categorySlug: "health-sports",
    icon: "/reftek-icons/limoomi.png",
    sortOrder: 1,
    linkType: "static",
    url: "https://limoome.com/",
  },
  {
    appId: "fitamin",
    name: "فیتامین",
    categorySlug: "health-sports",
    icon: "/reftek-icons/fitamin.svg",
    sortOrder: 2,
    linkType: "static",
    url: "https://fitamin.ir/",
  },
  {
    appId: "aramia",
    name: "آرامیا",
    categorySlug: "health-sports",
    icon: "/reftek-icons/aramia.png",
    sortOrder: 3,
    linkType: "static",
    url: "https://aramia.me/",
  },
  {
    appId: "zaban-master",
    name: "زبان مستر",
    categorySlug: "education",
    icon: "/reftek-icons/zaban-master.png",
    sortOrder: 1,
    linkType: "static",
    url: "https://zabanmaster.com/",
  },
  {
    appId: "fixa",
    name: "فیکسا",
    categorySlug: "home-services",
    icon: "/reftek-icons/fixa.svg",
    sortOrder: 1,
    linkType: "static",
    url: "https://fixa24.com/",
  },
  {
    appId: "filmnet",
    name: "فیلم نت",
    categorySlug: "entertainment",
    icon: "/reftek-icons/Filmnet-Logo.webp",
    sortOrder: 1,
    linkType: "static",
    url: "https://filmnet.ir/",
  },
  {
    appId: "filimo",
    name: "فیلیمو",
    categorySlug: "entertainment",
    icon: "/reftek-icons/filimo.png",
    sortOrder: 2,
    linkType: "static",
    url: "https://www.filimo.com/",
  },
  {
    appId: "zaban-shenas",
    name: "زبان شناس",
    categorySlug: "education",
    icon: "/reftek-icons/zaban-shenas.png",
    sortOrder: 2,
    linkType: "static",
    url: "https://zabanshenas.com/",
  },
  {
    appId: "nashr-iran-ban",
    name: "نشر ایران بان",
    categorySlug: "books",
    icon: "/reftek-icons/nashr-iran-ban.png",
    sortOrder: 1,
    linkType: "static",
    url: "https://ibpublication.com/",
  },
  {
    appId: "ketab-land",
    name: "کتاب لند",
    categorySlug: "books",
    icon: "/reftek-icons/KETABLAND-logo.webp",
    sortOrder: 2,
    linkType: "static",
    url: "https://ketab.land/",
  },
  {
    appId: "aia-plus",
    name: "آیا پلاس",
    categorySlug: "ai",
    icon: "/reftek-icons/aia-plus.png",
    sortOrder: 2,
    linkType: "static",
    url: "https://aiaplus.com/",
  },
];
