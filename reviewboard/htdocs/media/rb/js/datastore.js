RB = {};

RB.Offline = {
    /* Types */
    STATE_ONLINE: 1,
    STATE_OFFLINE: 2,
    STATE_CALC_SYNC: 3,
    STATE_SYNCING: 4,

    /* Offline state */
    state: null,
    backend: null,

    pendingURLs: [],
    totalURLs: 0,

    /* Callbacks */
    onStateChanged: function(state) {},
    onProgress: function(filesComplete, filesTotal) {},

    init: function() {
        if (window.google && google.gears) {
            this.backend = RB.Offline.Gears;
        } else {
            // TODO: HTML 5
        }

        this._updateState(this.isOffline()
                          ? this.STATE_OFFLINE
                          : this.STATE_ONLINE)
    },

    offlineSupported: function() {
        return this.backend != null;
    },

    isOffline: function() {
        return this.offlineSupported && this.backend.isOffline();
    },

    checkPermission: function() {
        if (this.offlineSupported) {
            return this.backend.checkPermission();
        }

        return false;
    },

    goOnline: function() {
        if (this.state != this.STATE_ONLINE) {
            this._updateState(this.STATE_ONLINE);
            this.backend.setLookupsEnabled(false);
        }
    },

    goOffline: function() {
        console.log("1");
        console.log(this.state);
        if (this.state == this.STATE_ONLINE && this.offlineSupported()) {
            console.log("2");
            this.synchronize();
        }
    },

    synchronize: function() {
        if (!this.checkPermission()) {
            console.log("No permission");
            return;
        }

        var self = this;
        this.pendingURLs = [];

        this._updateState(this.STATE_CALC_SYNC);

        console.log("synchronizing");
        $.getJSON(SITE_ROOT + "offline/manifests/", function(manifestsList) {
            self._loadManifestsList(manifestsList);
        });
    },

    _updateState: function(state) {
        this.state = state;
        this.onStateChanged(state);
    },

    _loadManifestsList: function(manifestsList) {
        var self = this;

        $.each(manifestsList.urls, function(i, item) {
            /* Get the URLs from this manifest. */
            $.funcQueue("offline").add(function() {
                $.getJSON(item['url'], function(manifest) {
                    self._preprocessManifest(manifest);
                    $.funcQueue("offline").next();
                });
            });
        });

        $.funcQueue("offline").add(function() {
            self.totalURLs = self.pendingURLs.length;
            self._captureFiles();
        });

        $.funcQueue("offline").add(function() {
            self._updateState(self.STATE_OFFLINE);
            self.backend.setLookupsEnabled(true);

            /* And we're done. */
        });

        $.funcQueue("offline").start();
    },

    _captureFiles: function() {
        /* Once we have the list of URLs, begin downloading. */
        var self = this;
        self._updateState(self.STATE_SYNCING);
        self.onProgress(0, self.totalURLs);

        self._downloadNextFile();
    },

    _downloadNextFile: function() {
        var self = this;

        if (self.pendingURLs.length == 0) {
            /* We're done with downloading. */
            $.funcQueue("offline").next();
            return;
        }

        var url_item = self.pendingURLs.shift();

        this.backend.capture(url_item['url'], function(url, success) {
            if (success) {
                if (url_item['aliases']) {
                    $.each(url_item['aliases'], function(i, alias) {
                        self.backend.aliasURL(url_item['url'], alias);
                    });
                }

                self.onProgress(self.totalURLs - self.pendingURLs.length,
                                self.totalURLs);
                self._downloadNextFile();
            } else {
                self._updateState(self.SYNC_FAILED);
                $.funcQueue("offline").clear();
                self.pendingURLs = [];
            }
        });
    },

	_preprocessManifest: function(manifest) {
		/* Determine if we need to load this manifest. */
		var needManifest = true; // TODO

		if (needManifest) {
            this.pendingURLs = this.pendingURLs.concat(manifest.urls);
		}
	}
};

RB.Offline.Gears = {
    localServer: null,
    store: null,

    setupServer: function() {
        try {
            this.localServer = google.gears.factory.create("beta.localserver");
            this.store = this.localServer.createStore("reviewboard");
            return true;
        }
        catch (e) {
            console.log(e);
            return false;
        }
    },

    isOffline: function() {
        return google.gears.factory.hasPermission &&
               (this.store != null || this.setupServer()) &&
               this.store.enabled;
    },

    checkPermission: function() {
        var allowed = getGoogleGearsAllowed();

        if (allowed && this.store == null) {
            allowed = this.setupServer();
        }

        return allowed;
    },

    setLookupsEnabled: function(enabled) {
        if (this.store != null) {
            this.store.enabled = enabled;
        }
    },

    capture: function(url, onDone) {
        this.store.capture(url, onDone);
    },

    aliasURL: function(url, alias) {
        this.store.copy(url, alias);
    }
};

// vim: set et:sw=4:
