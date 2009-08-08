RB = {};

RB.DiffComment = function(filediff, interfilediff, beginLineNum, endLineNum,
                          textOnServer) {
    this.filediff = filediff;
    this.interfilediff = interfilediff;
    this.beginLineNum = beginLineNum;
    this.endLineNum = endLineNum;
    this.text = textOnServer || "";
    this.saved = (textOnServer != undefined);

    return this;
}

$.extend(RB.DiffComment.prototype, {
    /*
     * Sets the current text in the comment block.
     *
     * @param {string} text  The new text to set.
     */
    setText: function(text) {
        this.text = text;
        $.event.trigger("textChanged", null, this);
    },

    /*
     * Returns the number of lines that this comment covers.
     *
     * @return {int} The number of lines this comment covers.
     */
    getNumLines: function() {
        return this.endLineNum - this.beginLineNum + 1;
    },

    /*
     * Saves the comment on the server.
     */
    save: function(onSuccess) {
        var self = this;

        rbApiCall({
            path: this._getURL(),
            data: {
                action: "set",
                num_lines: this.getNumLines(),
                text: this.text
            },
            success: function() {
                self.saved = true;
                $.event.trigger("saved", null, self);

                if ($.isFunction(onSuccess)) {
                    onSuccess();
                }
            }
        });
    },

    /*
     * Deletes the comment from the server.
     */
    deleteComment: function() {
        var self = this;

        if (this.saved) {
            rbApiCall({
                path: this._getURL(),
                data: {
                    action: "delete",
                    num_lines: this.getNumLines()
                },
                success: function() {
                    self.saved = false;
                    $.event.trigger("deleted", null, self);
                    self._deleteAndDestruct();
                }
            });
        }
        else {
            this._deleteAndDestruct();
        }
    },

    deleteIfEmpty: function() {
        if (this.text != "") {
            return;
        }

        this.deleteComment();
    },

    _deleteAndDestruct: function() {
        $.event.trigger("destroyed", null, this);
        delete self;
    },

    /*
     * Returns the URL used for API calls.
     *
     * @return {string} The URL used for API calls for this comment block.
     */
    _getURL: function() {
        var interfilediff_revision = null;
        var interfilediff_id = null;

        if (this.interfilediff != null) {
            interfilediff_revision = this.interfilediff['revision'];
            interfilediff_id = this.interfilediff['id'];
        }

        var filediff_revision = this.filediff['revision'];
        var filediff_id = this.filediff['id'];

        return "/reviewrequests/" + gReviewRequestId + "/diff/" +
               (interfilediff_revision == null
                ? filediff_revision
                : filediff_revision + "-" + interfilediff_revision) +
               "/file/" +
               (interfilediff_id == null
                ? filediff_id
                : filediff_id + "-" + interfilediff_id) +
               "/line/" + this.beginLineNum + "/comments/";
    }
});


RB.Diff = function(review_request, revision, interdiff_revision) {
    this.review_request = review_request;
    this.revision = revision;
    this.interdiff_revision = interdiff_revision;

    return this;
}

$.extend(RB.Diff.prototype, {
    getDiffFragment: function(fileid, filediff_id, chunk_index, onSuccess) {
        rbApiCall({
            url: SITE_ROOT + 'r/' + this.review_request.id + '/diff/' +
                 this._getRevisionString() + '/fragment/' + filediff_id +
                 '/chunk/' + chunk_index + '/',
            data: {},
            type: "GET",
            dataType: "html",
            complete: function(res, status) {
                if (status == "success") {
                    onSuccess(res.responseText);
                }
            }
        });
    },

    getDiffFile: function(filediff_id, file_index, onSuccess) {
        $.ajax({
            type: "GET",
            url: SITE_ROOT + "r/" + this.review_request.id + "/diff/" +
                 this._getRevisionString() + "/fragment/" + filediff_id +
                 "/?index=" + file_index + "&" + AJAX_SERIAL,
            complete: onSuccess
        });
    },

    _getRevisionString: function() {
        var revision = this.revision;

        if (this.interdiff_revision != null) {
            revision += "-" + this.interdiff_revision;
        }

        return revision;
    }
});


RB.ReviewRequest = function(id, path, buttons) {
    this.id = id;
    this.path = path;
    this.buttons = buttons;
    this.reviews = {};
    this.draft_review = null;

    return this;
}

$.extend(RB.ReviewRequest.prototype, {
    /* Constants */
    CHECK_UPDATES_MSECS: 5 * 60 * 1000, // Every 5 minutes
    CLOSE_DISCARDED: 1,
    CLOSE_SUBMITTED: 2,

    /* Review request API */
    createDiff: function(revision, interdiff_revision) {
        return new RB.Diff(this, revision, interdiff_revision);
    },

    createReview: function(review_id) {
        if (review_id == undefined) {
            if (this.draft_review == null) {
                this.draft_review = new RB.Review(this);
            }

            return this.draft_review;
        }
        else if (!this.reviews[review_id]) {
            this.reviews[review_id] = new RB.Review(this, review_id);
        }

        return this.reviews[review_id];
    },

    createScreenshot: function() {
        return new RB.Screenshot(this);
    },

    setDraftField: function(field, value, onSuccess, onError) {
        this._apiCall({
            path: "/draft/set/" + field + "/",
            buttons: this.buttons,
            data: { value: value },
            errorPrefix: "Saving the draft has failed due to a " +
                         "server error:",
            success: onSuccess, // XXX
            error: onError // XXX
        });
    },

    publish: function() {
        this._apiCall({
            path: "/publish/",
            buttons: this.buttons,
            errorPrefix: "Publishing the draft has failed due to a " +
                         "server error:"
        });
    },

    discardDraft: function() {
        this._apiCall({
            path: "/draft/discard/",
            buttons: this.buttons,
            errorPrefix: "Discarding the draft has failed due to a " +
                         "server error:"
        });
    },

    close: function(type) {
        if (type == this.CLOSE_DISCARDED) {
            this._apiCall({
                path: "/close/discarded/",
                buttons: this.buttons,
                errorPrefix: "Discarding the review request has failed " +
                             "due to a server error:"
            });
        }
        else if (type == this.CLOSE_SUBMITTED) {
            this._apiCall({
                path: "/close/submitted/",
                buttons: this.buttons,
                errorPrefix: "Setting the review request as submitted " +
                             "has failed due to a server error:"
            });
        }
    },

    reopen: function() {
        this._apiCall({
            path: "/reopen/",
            buttons: this.buttons,
            errorPrefix: "Reopening the review request has failed " +
                         "due to a server error:"
        });
    },

    deletePermanently: function(buttons, onSuccess) {
        this._apiCall({
            path: "/delete/",
            buttons: this.buttons.add(buttons), // XXX
            errorPrefix: "Deleting the review request has failed " +
                         "due to a server error:",
            success: onSuccess
        });
    },

    beginCheckForUpdates: function(type, lastUpdateTimestamp) {
        var self = this;

        this.checkUpdatesType = type;
        this.lastUpdateTimestamp = lastUpdateTimestamp;

        setTimeout(function() { self._checkForUpdates(); },
                   this.CHECK_UPDATES_MSECS);
    },

    _checkForUpdates: function() {
        var self = this;

        this._apiCall({
            type: "GET",
            noActivityIndicator: true,
            path: "/last-update/",
            success: function(rsp) {
                if ((self.checkUpdatesType == undefined ||
                     self.checkUpdatesType == rsp.type) &&
                    self.lastUpdateTimestamp != rsp.timestamp) {
                    $.event.trigger("updated", [rsp], self);
                }

                self.lastUpdateTimestamp = rsp.timestamp;

                setTimeout(function() { self._checkForUpdates(); },
                           self.CHECK_UPDATES_MSECS);
            }
        });
    },

    _apiCall: function(options) {
        var self = this;

        options.path = "/reviewrequests/" + this.id + options.path;

        if (!options.success) {
            options.success = function() { window.location = self.path; };
        }

        rbApiCall(options);
    }
});


RB.Review = function(review_request, id) {
    this.id = id;
    this.review_request = review_request;
    this.draft_reply = null;
    this.shipit = false;
    this.body_top = "";
    this.body_bottom = "";

    return this;
}

$.extend(RB.Review.prototype, {
    createReply: function() {
        if (this.draft_reply == null) {
            this.draft_reply = new RB.ReviewReply(this);
        }

        return this.draft_reply;
    },

    save: function(buttons, onSuccess) {
        this._apiCall({
            path: "save/",
            data: {
                shipit: this.shipit,
                body_top: this.body_top,
                body_bottom: this.body_bottom,
            },
            buttons: buttons,
            success: onSuccess
        });
    },

    publish: function(buttons, onSuccess) {
        this._apiCall({
            path: "publish/",
            data: {
                shipit: this.shipit,
                body_top: this.body_top,
                body_bottom: this.body_bottom,
            },
            buttons: buttons,
            success: onSuccess
        });
    },

    deleteReview: function(buttons, onSuccess) {
        this._apiCall({
            path: "delete/",
            buttons: buttons,
            success: onSuccess
        });
    },

    _apiCall: function(options) {
        var self = this;

        options.path = "/reviewrequests/" + this.review_request.id +
                       "/reviews/draft/" + options.path;

        if (!options.success) {
            options.success = function() { window.location = self.path; };
        }

        rbApiCall(options);
    }
});


RB.ReviewReply = function(review) {
    this.review = review;

    return this;
}

$.extend(RB.ReviewReply.prototype, {
    addComment: function(context_id, context_type, value,
                         buttons, onSuccess) {
        rbApiCall({
            path: "/reviewrequests/" + this.review.review_request.id +
                  "/reviews/" + this.review.id + "/replies/draft/",
            data: {
                value:     value,
                id:        context_id,
                type:      context_type,
                review_id: this.review.id
            },
            buttons: buttons,
            success: onSuccess
        });
    },

    publish: function(buttons, onSuccess) {
        rbApiCall({
            path: '/reviewrequests/' + this.review.review_request.id +
                  '/reviews/' + this.review.id + '/replies/draft/save/',
            buttons: buttons,
            errorText: "Saving the reply draft has " +
                       "failed due to a server error:",
            success: onSuccess
        });
    },

    discard: function(buttons, onSuccess) {
        rbApiCall({
            path: '/reviewrequests/' + this.review.review_request.id +
                  '/reviews/' + this.review.id + '/replies/draft/discard/',
            buttons: buttons,
            errorText: "Discarding the reply draft " +
                       "has failed due to a server error:",
            success: onSuccess
        });
    }
});


RB.Screenshot = function(review_request, id) {
    this.review_request = review_request;
    this.id = id;

    return this;
}

$.extend(RB.Screenshot.prototype, {
    setData: function(filename, blob) {
        this.filename = filename;
        this.blob = blob;
    },

    save: function(buttons, onSuccess, onError) {
        if (this.id != undefined) {
            /* TODO: Support updating screenshots eventually. */
            onError("The screenshot " + this.id + " was already created. " +
                    "This is a script error. Please report it.");
            return;
        }

        var blobBuilder;

        try {
            blobBuilder = google.gears.factory.create("beta.blobbuilder");
        }
        catch (e) {
            onError("RB.Screenshot.save requires Google Gears, which was " +
                    "not found. This is a script error. Please report it.");
            return;
        }

        var boundary = "-----multipartformboundary" + new Date().getTime();
        blobBuilder.append("--" + boundary + "\r\n");
        blobBuilder.append('Content-Disposition: form-data; name="path"; ' +
                           'filename="' + this.filename + '"\r\n');
        blobBuilder.append('Content-Type: application/octet-stream\r\n');
        blobBuilder.append('\r\n');
        blobBuilder.append(this.blob);
        blobBuilder.append('\r\n');
        blobBuilder.append("--" + boundary + "--\r\n");
        blobBuilder.append('\r\n');

        var blob = blobBuilder.getAsBlob();

        /*
         * This is needed to prevent an error in jQuery.ajax, when it tries
         * to match the data to e regex.
         */
        blob.match = function(regex) {
            return false;
        }

        rbApiCall({
            path: '/reviewrequests/' + this.review_request.id +
                  '/screenshot/new/',
            buttons: buttons,
            data: blob,
            processData: false,
            contentType: "multipart/form-data; boundary=" + boundary,
            xhr: function() {
                return google.gears.factory.create("beta.httprequest");
            },
            errorPrefix: "Uploading the screenshot has failed " +
                         "due to a server error:",
            success: function(rsp) {
                if (rsp.stat == "ok") {
                    onSuccess(screenshot);
                } else {
                    onError(rsp.err.msg);
                }
            }
        });
    }
});


RB.ScreenshotComment = function(screenshot_id, x, y, width, height,
                                textOnServer) {
    this.screenshot_id = screenshot_id;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.text = textOnServer || "";
    this.saved = (textOnServer != undefined);

    return this;
}

$.extend(RB.ScreenshotComment.prototype, {
    /*
     * Sets the current text in the comment block.
     *
     * @param {string} text  The new text to set.
     */
    setText: function(text) {
        this.text = text;
        $.event.trigger("textChanged", null, this);
    },

    /*
     * Saves the comment on the server.
     */
    save: function(onSuccess) {
        var self = this;

        rbApiCall({
            path: this._getURL(),
            data: {
                action: "set",
                text: this.text
            },
            success: function() {
                self.saved = true;
                $.event.trigger("saved", null, self);

                if ($.isFunction(onSuccess)) {
                    onSuccess();
                }
            }
        });
    },

    /*
     * Deletes the comment from the server.
     */
    deleteComment: function() {
        var self = this;

        if (this.saved) {
            rbApiCall({
                path: this._getURL(),
                data: {
                    action: "delete"
                },
                success: function() {
                    self.saved = false;
                    $.event.trigger("deleted", null, self);
                    self._deleteAndDestruct();
                }
            });
        }
        else {
            this._deleteAndDestruct();
        }
    },

    deleteIfEmpty: function() {
        if (this.text != "") {
            return;
        }

        this.deleteComment();
    },

    _deleteAndDestruct: function() {
        $.event.trigger("destroyed", null, this);
        delete self;
    },

    /*
     * Returns the URL used for API calls.
     *
     * @return {string} The URL used for API calls for this comment block.
     */
    _getURL: function() {
        return "/reviewrequests/" + gReviewRequestId + "/s/" +
               this.screenshot_id + "/comments/" +
               Math.round(this.width) + "x" + Math.round(this.height) +
               "+" + Math.round(this.x) + "+" + Math.round(this.y) + "/";
    }
});

// vim: set et:sw=4:
