# Richtrad vizuální testy

[Přímý odkaz pro účastníky výzkumu](https://richtrad.github.io/richtrad-vizualni-testy/testy/dynamicke-textury/) · [Přehled testů](https://richtrad.github.io/richtrad-vizualni-testy/) · [Technická zkouška](https://richtrad.github.io/richtrad-vizualni-testy/testy/dynamicke-textury/?rezim=zkouska)

Web běží na GitHub Pages ze složky `docs/`. Každý další test může mít vlastní adresář pod `docs/testy/` a položku na titulní stránce.

## První pilot

Podobnost krátkých videí zachovává protokol M2-human-60-v1, všech 69 obrazových mřížek a 32 původních plánů po 64 volbách. Výzkumné účasti dostávají sloty na serveru. Režim „Jen vyzkoušet“ má vlastní relace. Pro porovnání je potřeba okno alespoň 900 × 650 CSS pixelů a alespoň čtyři sekundy viditelného přehrávání. Zdroje a licence jsou na [stránce o datech](https://richtrad.github.io/richtrad-vizualni-testy/o-datech.html).

Soubory `protocol.json`, `session_plans.json` a `trials.json` ve složce testu jsou původní zmrazené výzkumné podklady. Popis místního sběru v protokolu dokumentuje jeho původní verzi. Veřejný kanál zaznamenává `collection_channel=github-pages-d1-v1` a souhlas `dobrovolny-verejny-sber-v1`. Rozdělení osob a plánů se vztahuje k této veřejné kohortě. Při kombinaci s jinou kolekcí je třeba rozlišit její původ a obsazení slotů.

## Uložení výsledků

Při střídání u stejného počítače zvolte po dokončení nebo přerušení **Další účastník**. Každý nový souhlas vytvoří vlastní relaci. Výzkumných míst je 32 celkem pro celý pilot. Při přerušení lze uložit osobní odkaz pro návrat ve stejném prohlížeči. Ke sdílení studentům slouží přímý odkaz nahoře.

GitHub Pages obsluhují rozhraní. Modul ve složce `sber/` přijímá odpovědi přes HTTPS a transakčně je ukládá do databáze D1. Každá volba je potvrzena serverem. Při přerušení spojení zůstane připravená volba v prohlížeči do dalšího odeslání. Náhodný přístupový klíč umožní obnovit relaci nebo stáhnout vlastní JSON. Nevyužitá rezervace bez odpovědí může po 24 hodinách uvolnit slot.

Výzkumník najde hodinové a ručně spustitelné zálohy v [soukromém repozitáři výsledků](https://github.com/richtrad/richtrad-vizualni-testy-vysledky). Veřejný zdroj obsahuje pouze otisk exportního klíče. Administrátorský export vyžaduje tajný klíč uložený v soukromých GitHub Actions secrets. Každý exportovaný soubor odpovídá schématu `dt_human_session_v1` a zachovává štítky plánu potřebné pro výzkumnou kalibraci.
