"""Local text-to-music and text-to-sound-effects (opt-in models, offline after install).

Layers, each testable without a GPU or a download:

* :mod:`.catalog`    engine behaviour joined to the legal registry
* :mod:`.policy`     what a declared use (personal / commercial) may select
* :mod:`.provenance` what is stored with every output
* :mod:`.runtime`    isolated sidecar environments and the worker command
* :mod:`.jobs`       queue, progress, cancellation and the generation itself
"""
