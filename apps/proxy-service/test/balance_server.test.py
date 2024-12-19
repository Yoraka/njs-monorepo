from flask import Flask

app = Flask(__name__)

@app.route('/')
def home():
    return "Hello, World!, port: " + str(port)

import sys

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    app.run(port=port)