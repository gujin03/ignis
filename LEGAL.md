# Legal Notice

Ignis is not affiliated with, endorsed by, or associated with Dynalist Inc. or Obsidian.

Ignis is an independently developed interoperability tool. It contains no Obsidian source code, binaries, or assets. No part of Obsidian is distributed, bundled, or included in this repository. Ignis serves its own HTML page that loads the shim layer, then dynamically loads Obsidian's unmodified scripts. Obsidian's own files are never altered, patched, or transformed, either on disk or in transit.

Ignis works by providing a compatibility layer that implements browser-compatible equivalents of the Node.js and Electron APIs that Obsidian depends on. The user must obtain their own licensed copy of Obsidian separately. Ignis has no standalone functionality without it.

## Interoperability under EU law

The development of Ignis involved studying Obsidian's module interface layer to understand how it interacts with the Electron and Node.js runtime. This work falls under the interoperability provisions of [Directive 2009/24/EC of the European Parliament and of the Council](https://eur-lex.europa.eu/eli/dir/2009/24/oj/eng) (the EU Software Directive), which permits decompilation and analysis of a computer program to achieve interoperability with an independently created program.

Specifically:

- **Article 6(1)** permits reproduction and translation of code where it is indispensable to obtain the information necessary to achieve interoperability of an independently created program with other programs, provided that: (a) the acts are performed by a person having a right to use the program, (b) the interoperability information was not previously readily available, and (c) the acts are confined to the parts necessary to achieve interoperability.
- **Article 5(3)** permits a lawful user to observe, study, and test the functioning of a program to determine the ideas and principles underlying its elements, including its interfaces.
- **Article 8** states that any contractual provisions contrary to Article 6 or the exceptions in Article 5(2) and (3) shall be null and void.

The shim layer targets the runtime interface boundary, the points where Obsidian calls Node.js and Electron APIs, and replaces them with browser-compatible equivalents backed by a server. No Obsidian application logic, algorithms, or non-interface code is reproduced. Ignis also includes a plugin that uses Obsidian's plugin API to add browser-specific functionality such as file upload and download. This plugin interacts with Obsidian in the same manner as any third-party community plugin.

## What Ignis does and does not do

**Does:**
- Provide independently written JavaScript modules that implement Node.js and Electron API surfaces in a browser context
- Provide a server that exposes filesystem operations over HTTP and WebSocket
- Load a shim layer at runtime that intercepts Obsidian's API calls before they reach the (absent) Node.js and Electron environment

**Does not:**
- Distribute, bundle, or include any Obsidian source code, binaries, or assets in this repository. Obsidian is downloaded by the user's own container instance directly from official sources at runtime.
- Modify, patch, or alter any of Obsidian's files on disk
- Reproduce Obsidian's application logic, algorithms, or non-interface code
- Function as a standalone application without Obsidian
- Compete with or replace Obsidian

## Regarding Obsidian's Terms of Service

Obsidian's Terms of Service (Section: Restrictions, item iii) restrict reverse engineering except for the purpose of developing third-party plugins for non-commercial use. To the extent that this restriction conflicts with the rights granted under the EU Software Directive, Article 8 of the Directive renders such contractual provisions null and void.

This project is developed and maintained by an individual based in the European Union, where the Directive applies as implemented in national law.

## Good faith

This project exists because its author uses Obsidian daily and wants to access it from a browser. It is shared in the belief that tools enabling software interoperability benefit users and are protected under EU law. There is no intent to harm Obsidian, Dynalist Inc., or their business. If you are a representative of Dynalist Inc. and wish to discuss this project, please reach out via the contact information provided below.

Email: ignis@thiefling.com
