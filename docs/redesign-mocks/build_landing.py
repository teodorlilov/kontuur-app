import base64, re, pathlib

SP = pathlib.Path(__file__).parent
tpl = (SP / 'landing.template.html').read_text()

base = (SP / 'direction-01.html').read_text()
m = re.search(r'<style>(.*?)</style>', base, re.S)
assert m, 'no base <style> block found'
html = tpl.replace('__BASE_CSS__', m.group(1))

for name in ['cafe', 'nutrition', 'atelier', 'interior', 'skincare', 'botanical',
             'eng-cafe', 'eng-protein']:
    b64 = base64.b64encode((SP / f'img-{name}-c.jpg').read_bytes()).decode()
    ph = name.upper().replace('-', '_')
    html = html.replace(f'__IMG_{ph}__', f'data:image/jpeg;base64,{b64}')

assert not re.search(r'__[A-Z_0-9]+__', html), 'leftover placeholders'

for tag in ['div', 'section', 'span', 'p', 'a', 'button', 'form', 'dialog', 'style', 'script']:
    o = len(re.findall(rf'<{tag}(?=[\s>/])', html)) - len(re.findall(rf'<{tag}(?:\s[^>]*)?/>', html))
    c = html.count(f'</{tag}>')
    assert o == c, f'tag mismatch {tag}: {o} open vs {c} close'

assert 'display: grid; grid-template-columns: 1fr 1fr; align-items: center' in html, 'split grid rule missing'
assert html.count('pturn') == 5, f"pturn refs: {html.count('pturn')}"
assert 'class="cap-card ctac open-signup' in html, 'CTA cap card missing'

out = SP / 'landing.html'
out.write_text(html)
print('OK', len(html) // 1024, 'KB')
