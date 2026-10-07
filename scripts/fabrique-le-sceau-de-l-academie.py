# LE SCEAU DENTELÉ DE L'ACADÉMIE MND — 7 octobre 2026.
#
# « Pour les diplômes de l'Académie, crée un sceau dentelé MND Académie »
# (Yéman). Maquette DagAWw1Wfb2S1rt2pYc4pW validée (« construis »). Le
# contour dentelé du sceau de la Maison (mnd-6-dentele), en Vert Savoir,
# aux mots de l'Académie ; au centre, son pictogramme pris TEL QUEL dans la
# charte (docs/marque/sous-marques/logos), jamais redessiné.
#
# Sortie : public/assets/tampons/academie-dentele.png (600 px, fond
# transparent), rendu par Chrome sans tête avec Jost et Cormorant Garamond.
# Usage : python scripts/fabrique-le-sceau-de-l-academie.py
import math, os, re, subprocess, tempfile

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PICTO = os.path.join(RACINE, 'public', 'assets', 'academie', 'pictogramme.svg')
SORTIE = os.path.join(RACINE, 'public', 'assets', 'tampons', 'academie-dentele.png')
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
VERT, INDIGO, IVOIRE = '#2F5D50', '#1E2150', '#F6F1E7'


def sceau_svg() -> str:
    chemins = ''.join(re.findall(r'<path[^>]*/>', open(PICTO, encoding='utf8').read()))
    n = 64
    dents = ' '.join(
        f'{200 + (197 if i % 2 == 0 else 181) * math.cos(-math.pi / 2 + i * math.pi / n):.1f},'
        f'{200 + (197 if i % 2 == 0 else 181) * math.sin(-math.pi / 2 + i * math.pi / n):.1f}'
        for i in range(2 * n))
    def pt(r, deg):
        return f'{200 + r * math.cos(math.radians(deg)):.1f} {200 + r * math.sin(math.radians(deg)):.1f}'
    k = 104 / 814
    tx, ty = 200 - 52, 170 - 672 * k / 2
    return f'''<svg viewBox="0 0 400 400" width="600" height="600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <path id="h" d="M {pt(134, 170)} A 134 134 0 1 1 {pt(134, 10)}"/>
    <path id="b" d="M {pt(142, 160)} A 142 142 0 0 0 {pt(142, 20)}"/>
  </defs>
  <polygon points="{dents}" fill="{VERT}"/>
  <circle cx="200" cy="200" r="172" fill="{IVOIRE}"/>
  <circle cx="200" cy="200" r="164" fill="none" stroke="{VERT}" stroke-width="3"/>
  <circle cx="200" cy="200" r="106" fill="none" stroke="{VERT}" stroke-width="2"/>
  <text font-family="Jost" font-weight="500" font-size="19" letter-spacing="3" fill="{VERT}" text-anchor="middle"><textPath href="#h" startOffset="50%">ACADÉMIE MND · COTONOU · BÉNIN</textPath></text>
  <text font-family="Jost" font-weight="500" font-size="14" letter-spacing="2" fill="{VERT}" text-anchor="middle" dominant-baseline="hanging"><textPath href="#b" startOffset="50%">FORMER · TRANSMETTRE · AFFIRMER</textPath></text>
  <g fill="{VERT}" transform="translate({tx:.1f} {ty:.1f}) scale({k:.5f})">{chemins}</g>
  <text x="200" y="244" font-family="Jost" font-weight="600" font-size="15" letter-spacing="3.5" fill="{INDIGO}" text-anchor="middle">CERTIFICATION</text>
  <text x="200" y="266" font-family="Cormorant Garamond" font-style="italic" font-size="15" fill="{VERT}" text-anchor="middle">la direction pédagogique</text>
</svg>'''


def main() -> None:
    page = ('<!doctype html><meta charset="utf-8">'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital@1&family=Jost:wght@500;600&display=block">'
            '<style>html,body{margin:0;background:transparent}svg{display:block}</style>' + sceau_svg())
    with tempfile.TemporaryDirectory() as d:
        html = os.path.join(d, 'sceau.html')
        open(html, 'w', encoding='utf8').write(page)
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=600,600',
                        '--default-background-color=00000000', '--virtual-time-budget=6000',
                        f'--screenshot={SORTIE}', 'file:///' + html.replace('\\', '/')], check=True, capture_output=True)
    print('ecrit :', SORTIE, os.path.getsize(SORTIE), 'octets')


if __name__ == '__main__':
    main()
