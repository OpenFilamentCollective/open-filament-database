# WebUI, User interface but on the web
The WebUI is a simple but effective user interface which allows you to modify the database in a nice and easy way without having to crawl through terminals or files.

The WebUI is structured in layers, like shown below
```
[brand (Bambu lab, ESun3D, SUNLU)]
└── [material (e.g. PLA, ABS, PETG)]
    └── [filament (e.g. sparkly, pla basic)]
        └── [variant (e.g. Black, Rainbow, Variant B)]
```
So if you want to add a brand you can add that on the homepage of the website, then you can modify the brands materials, filaments and the individual variants of those filaments.

To run the WebUI simply take your previous terminal window and run the following lines in it
1. Enter the WebUI folder and install the WebUI needs automatically
   ```bash
   cd webui
   npm ci
   ```

2. Start the website
   ```bash
   npm run dev
   ```
3. Navigate to the link printed in the terminal, most of the time this will be http://localhost:5173 but it might vary slightly.
4. Modify to your hearts content!