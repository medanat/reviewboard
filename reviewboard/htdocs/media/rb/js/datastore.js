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
        var self = this;

        if (window.google && google.gears) {
            this.backend = RB.Offline.Gears;
        }

        this._updateState(this.isOffline()
                          ? this.STATE_OFFLINE
                          : this.STATE_ONLINE)

        $(window)
            .bind("offline", function() { self.goOffline(); })
            .bind("online", function() { self.goOnline(); });
    },

    offlineSupported: function() {
        return this.backend != null;
    },

    canGoOnline: function() {
        /*
         * NOTE: Older browsers don't have navigator.onLine, so this will
         *       be 'undefined'. Check explicitly against false.
         */
        return navigator.onLine != false;
    },

    isOffline: function() {
        return this.offlineSupported() &&
               (this.backend.isOffline() || !this.canGoOnline());
    },

    checkPermission: function() {
        if (this.offlineSupported()) {
            return this.backend.checkPermission();
        }

        return false;
    },

    goOnline: function() {
        if (this.state != this.STATE_ONLINE && this.canGoOnline()) {
            this._updateState(this.STATE_ONLINE);
            this.backend.setLookupsEnabled(false);
        }
    },

    goOffline: function() {
        if (!this.isOffline()) {
            this.synchronize();
        } else {
            /* The browser is already offline. Tell it to use the cache. */
            this._switchOffline();
        }
    },

    synchronize: function() {
        if (!this.checkPermission()) {
            return;
        }

        var self = this;
        this.pendingURLs = [];

        this._updateState(this.STATE_CALC_SYNC);

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

        $.funcQueue("offline").clear();

        $.each(manifestsList.urls, function(i, item) {
            /* Get the URLs from this manifest. */
            $.funcQueue("offline").add(function() {
                $.getJSON(item.url, function(manifest) {
                    self._preprocessManifest(item.url, manifest);
                    $.funcQueue("offline").next();
                });
            });
        });

        $.funcQueue("offline").add(function() {
            self.totalURLs = self.pendingURLs.length;

            if (self.totalURLs == 0) {
                $.funcQueue("offline").next();
            }
            else {
                self._captureFiles();
            }
        });

        $.funcQueue("offline").add(function() {
            /* And we're done. */
            self._switchOffline();
        });

        $.funcQueue("offline").start();
    },

    _preprocessManifest: function(url, manifest) {
        if (!this.backend.hasManifest(url, manifest)) {
            this.backend.storeManifest(url, manifest);
            this.pendingURLs = this.pendingURLs.concat(manifest.urls);
        }
    },

    _captureFiles: function() {
        /* Once we have the list of URLs, begin downloading. */
        this._updateState(this.STATE_SYNCING);
        this.onProgress(0, this.totalURLs);

        this._downloadNextFile();
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

    _switchOffline: function() {
        this._updateState(this.STATE_OFFLINE);
        this.backend.setLookupsEnabled(true);
    }
};

RB.Offline.Gears = {
    localServer: null,
    store: null,
    db: null,

    setupServer: function() {
        try {
            this.localServer = google.gears.factory.create("beta.localserver");
            this.store = this.localServer.createStore("reviewboard");

            this.db = google.gears.factory.create("beta.database");
            this.db.open("reviewboard");
            this.db.execute("CREATE TABLE IF NOT EXISTS manifest_versions" +
                            " (url TEXT, version TEXT)");
            return true;
        }
        catch (e) {
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

    hasManifest: function(url, manifest) {
        return (this._getVersionForManifest(url) == manifest.version);
    },

    storeManifest: function(url, manifest) {
        if (this._getVersionForManifest(url) != null) {
            this.db.execute("UPDATE manifest_versions SET version = ?" +
                            " WHERE url = ?",
                            [manifest.version, url]);
        }
        else {
            this.db.execute("INSERT INTO manifest_versions (url, version)" +
                            " VALUES (?, ?)",
                            [url, manifest.version]);
        }
    },

    capture: function(url, onDone) {
        this.store.capture(url, onDone);
    },

    aliasURL: function(url, alias) {
        this.store.copy(url, alias);
    },

    _getVersionForManifest: function(url) {
        var version = null;
        var rs = this.db.execute("SELECT version FROM manifest_versions" +
                                 " WHERE url = ?", [url]);

        if (rs.isValidRow()) {
            version = rs.fieldByName("version");
        }

        rs.close();

        return version;
    }
};

// vim: set et:sw=4:
