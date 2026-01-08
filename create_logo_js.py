import base64

with open(r'e:\Coding\Project\Ramadan-Timing\images\logo.jpg', 'rb') as f:
    data = base64.b64encode(f.read()).decode('utf-8')

js_content = f'const LOGO_BASE64 = "data:image/jpeg;base64,{data}";'

with open(r'e:\Coding\Project\Ramadan-Timing\logo.js', 'w', encoding='utf-8') as f:
    f.write(js_content)
