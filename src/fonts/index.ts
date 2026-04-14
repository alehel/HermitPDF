import localFont from "next/font/local";

export const poppins = localFont({
  src: [
    {
      path: "./Poppins-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./Poppins-Medium.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-poppins",
  display: "swap",
});

export const urbanist = localFont({
  src: "./Urbanist.woff2",
  weight: "400 600",
  style: "normal",
  variable: "--font-urbanist",
  display: "swap",
});
