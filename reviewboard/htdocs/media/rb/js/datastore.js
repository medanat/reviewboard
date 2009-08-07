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
    save: function() {
        var self = this;

        rbApiCall({
            url: this._getURL(),
            data: {
                action: "set",
                num_lines: this.getNumLines(),
                text: this.text
            },
            success: function() {
                self.saved = true;
                $.event.trigger("saved", null, self);
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
                url: this._getURL(),
                data: {
                    action: "delete",
                    num_lines: this.getNumLines()
                },
                success: function() {
                    self.saved = false;
                    $.event.trigger("deleted", null, this);
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

        return getReviewRequestAPIPath(true) +
               getDiffAPIPath(this.filediff['revision'], this.filediff['id'],
                              interfilediff_revision, interfilediff_id,
                              this.beginLineNum);
    }
});

// vim: set et:sw=4:
