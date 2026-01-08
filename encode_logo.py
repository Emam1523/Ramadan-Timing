import base64

with open(r'e:\Coding\Project\Ramadan-Timing\images\logo.jpg', 'rb') as f:
    data = base64.b64encode(f.read()).decode('utf-8')

# Write to a text file so I can read it
with open(r'e:\Coding\Project\Ramadan-Timing\logo_base64.txt', 'w') as f:
    f.write(data)
