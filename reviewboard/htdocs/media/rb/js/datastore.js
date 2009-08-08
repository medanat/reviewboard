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
    save: function(options) {
        var self = this;
        options = options || {};

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

                if ($.isFunction(options.success)) {
                    options.success();
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

    setForm: function(form) {
        this.form = form;
    },

    save: function(options) {
        options = $.extend(true, {
            success: function() {},
            error: function() {}
        }, options);

        if (this.id != undefined) {
            /* TODO: Support updating screenshots eventually. */
            options.error("The diff " + this.id + " was already created. " +
                          "This is a script error. Please report it.");
            return;
        }

        if (!this.form) {
            options.error("No data has been set for this screenshot. This " +
                          "is a script error. Please report it.");
            return;
        }

        rbApiCall({
            path: '/reviewrequests/' + this.review_request.id + '/diff/new/',
            form: this.form,
            buttons: options.buttons,
            errorPrefix: "Uploading the diff has failed " +
                         "due to a server error:",
            success: function(rsp) {
                if (rsp.stat == "ok") {
                    options.success(rsp);
                } else {
                    options.error(rsp, rsp.err.msg);
                }
            }
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

    setStarred: function(starred) {
        this._apiCall({
            path: (starred ? "/star/" : "/unstar/"),
            success: function() {}
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

    save: function(options) {
        this._apiCall({
            path: "save/",
            data: {
                shipit: this.shipit,
                body_top: this.body_top,
                body_bottom: this.body_bottom,
            },
            buttons: options.buttons,
            success: options.success
        });
    },

    publish: function(options) {
        this._apiCall({
            path: "publish/",
            data: {
                shipit: this.shipit,
                body_top: this.body_top,
                body_bottom: this.body_bottom,
            },
            buttons: options.buttons,
            success: options.success
        });
    },

    deleteReview: function(options) {
        this._apiCall({
            path: "delete/",
            buttons: options.buttons,
            success: options.onSuccess
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


RB.ReviewGroup = function(id) {
    this.id = id;

    return this;
}

$.extend(RB.ReviewGroup.prototype, {
    setStarred: function(starred) {
        rbApiCall({
            path: "/groups/" + this.id + (starred ? "/star/" : "/unstar/"),
            success: function() {}
        });
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
    setFile: function(file) {
        this.file = file;
    },

    setForm: function(form) {
        this.form = form;
    },

    save: function(options) {
        options = $.extend(true, {
            success: function() {},
            error: function() {}
        }, options);

        if (this.id != undefined) {
            /* TODO: Support updating screenshots eventually. */
            options.error("The screenshot " + this.id + " was already " +
                          "created. This is a script error. Please " +
                          "report it.");
            return;
        }

        if (this.form) {
            this._saveForm(options);
        }
        else if (this.file) {
            this._saveFile(options);
        }
        else {
            options.error("No data has been set for this screenshot. This " +
                          "is a script error. Please report it.");
            return;
        }
    },

    _saveForm: function(options) {
        this._saveApiCall(options.success, options.error, {
            path: 'new/',
            buttons: options.buttons,
            form: this.form
        });
    },

    _saveFile: function(options) {
        var blobBuilder;

        try {
            blobBuilder = google.gears.factory.create("beta.blobbuilder");
        }
        catch (e) {
            options.error("RB.Screenshot.save requires Google Gears, " +
                          "which was not found. This is a script error. " +
                          "Please report it.");
            return;
        }

        var boundary = "-----multipartformboundary" + new Date().getTime();
        blobBuilder.append("--" + boundary + "\r\n");
        blobBuilder.append('Content-Disposition: form-data; name="path"; ' +
                           'filename="' + this.file.name + '"\r\n');
        blobBuilder.append('Content-Type: application/octet-stream\r\n');
        blobBuilder.append('\r\n');
        blobBuilder.append(this.file.blob);
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

        this._saveApiCall(options.success, options.error, {
            path: 'new/',
            buttons: options.buttons,
            data: blob,
            processData: false,
            contentType: "multipart/form-data; boundary=" + boundary,
            xhr: function() {
                return google.gears.factory.create("beta.httprequest");
            },
        });
    },

    _saveApiCall: function(onSuccess, onError, options) {
        rbApiCall($.extend(options, {
            path: '/reviewrequests/' + this.review_request.id +
                  '/screenshot/' + options.path,
            errorPrefix: "Uploading the screenshot has failed " +
                         "due to a server error:",
            success: function(rsp) {
                if (rsp.stat == "ok") {
                    if ($.isFunction(onSuccess)) {
                        onSuccess(rsp, rsp.screenshot);
                    }
                } else if ($.isFunction(onError)) {
                    onError(rsp, rsp.err.msg);
                }
            }
        }));
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
    save: function(options) {
        options = $.extend({
            success: function() {}
        }, options);

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
                options.success();
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


/*
 * Convenience wrapper for Review Board API functions. This will handle
 * any button disabling/enabling, write to the correct path prefix, form
 * uploading, and displaying server errors.
 *
 * options has the following fields:
 *
 *    buttons  - An optional list of buttons to disable/enable.
 *    form     - A form to upload, if any.
 *    type     - The request type (defaults to "POST").
 *    path     - The relative path to the Review Board API tree.
 *    data     - Data to send with the request.
 *    success  - An optional success callback. The default one will reload
 *               the page.
 *    error    - An optional error callback, called after the error banner
 *               is displayed.
 *    complete - An optional complete callback, called after the success or
 *               error callbacks.
 *
 * @param {object} options  The options, listed above.
 */
function rbApiCall(options) {
    function doCall() {
        if (options.buttons) {
            options.buttons.attr("disabled", true);
        }

        if (!options.noActivityIndicator) {
            $("#activity-indicator")
                .text((options.type || options.type == "GET")
                      ? "Loading..." : "Saving...")
                .show();
        }

        var data = $.extend(true, {
            url: options.url || (SITE_ROOT + "api/json" + options.path),
            data: options.data || {dummy: ""},
            dataType: options.dataType || "json",
            error: function(xhr, textStatus, errorThrown) {
                showServerError(options.errorPrefix + " " + xhr.status + " " +
                                xhr.statusText,
                                xhr.responseText);

                if ($.isFunction(options.error)) {
                    options.error(xhr, textStatus, errorThrown);
                }
            }
        }, options);

        data.complete = function(xhr, status) {
            if (options.buttons) {
                options.buttons.attr("disabled", false);
            }

            if (!options.noActivityIndicator) {
                $("#activity-indicator")
                    .delay(1000)
                    .fadeOut("fast");
            }

            if ($.isFunction(options.complete)) {
                options.complete(xhr, status);
            }

            $.funcQueue("rbapicall").next();
        };

        if (options.form) {
            options.form.ajaxSubmit(data);
        } else {
            $.ajax(data);
        }
    }

    options.type = options.type || "POST";

    if (options.type == "POST" || options.type == "PUT") {
        $.funcQueue("rbapicall").add(doCall);
        $.funcQueue("rbapicall").start();
    } else {
        doCall();
    }
}


// vim: set et:sw=4:
