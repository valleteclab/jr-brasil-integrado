"use client";

import Script from "next/script";

/**
 * Carrega o Meta Pixel e registra o PageView.
 *
 * O `pixelId` chega por prop a partir do layout (Server Component), que lê `META_PIXEL_ID`
 * do ambiente. É de propósito: uma variável `NEXT_PUBLIC_*` seria congelada no build da
 * imagem Docker, e aqui o deploy troca só as variáveis do serviço — assim o pixel pode ser
 * ligado/desligado sem rebuild.
 */
export function MetaPixel({ pixelId }: { pixelId?: string }) {
  if (!pixelId) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
