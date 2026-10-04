#!/usr/bin/perl
# Builds carrotbox_editor.js from src/ and syntax-checks the bundle and the plugins.
#
# src/beepbox_base.js is the (modded) BeepBox editor bundle. Lines of the form
#     //@@INCLUDE some_file.js@@
# are replaced with the contents of src/some_file.js, so the CarrotBox modules
# live in the same closure as BeepBox's own classes.
#
# Plugins (plugins/*.js) are separate files that the editor loads on demand.
# Their sizes are written back into the plugin catalog (src/fl_plugins.js) so
# the Plugin Manager shows real download sizes.
#
# Usage:  perl build.pl
use strict;
use warnings;
use File::Basename qw(dirname);
use Cwd qw(abs_path);

my $root = dirname(abs_path($0));
my $src  = "$root/src";
my $out  = "$root/carrotbox_editor.js";

sub slurp {
    my ($path) = @_;
    open(my $fh, '<:raw', $path) or die "can't read $path: $!\n";
    local $/;
    my $text = <$fh>;
    close($fh);
    return $text;
}

sub spew {
    my ($path, $text) = @_;
    open(my $fh, '>:raw', $path) or die "can't write $path: $!\n";
    print $fh $text;
    close($fh);
}

# Keep the catalog's download sizes honest.
sub update_plugin_sizes {
    my $path = "$src/fl_plugins.js";
    my $text = slurp($path);
    my $changed = 0;
    foreach my $plugin (sort glob("$root/plugins/*.js")) {
        my ($id) = $plugin =~ m{([^/]+)\.js$};
        my $kb = int((-s $plugin) / 1024 + 0.5);
        $kb = 1 if $kb < 1;
        if ($text =~ s{(file: "plugins/\Q$id\E\.js"[^\n]*?sizeKB: )\d+}{$1$kb}) {
            $changed = 1;
        }
    }
    spew($path, $text) if $changed;
}

sub expand {
    my ($path, $seen) = @_;
    die "include cycle: $path\n" if $seen->{$path};
    my %seen2 = (%$seen, $path => 1);
    my $text = '';
    open(my $fh, '<:raw', $path) or die "can't read $path: $!\n";
    while (my $line = <$fh>) {
        if ($line =~ m{^\s*//\@\@INCLUDE ([\w.\-]+)\@\@\s*$}) {
            my $name = $1;
            $text .= "// ---- begin $name ----\n" . expand("$src/$name", \%seen2) . "\n// ---- end $name ----\n";
        } else {
            $text .= $line;
        }
    }
    close($fh);
    return $text;
}

update_plugin_sizes();
my $result = expand("$src/beepbox_base.js", {});
spew($out, $result);
printf "wrote %s (%d bytes)\n", $out, length($result);

# --- syntax checks: node if we have it, JavaScriptCore on macOS otherwise
my $node = `command -v node 2>/dev/null`;
chomp($node);
my $jsc = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc";

sub check {
    my ($file) = @_;
    if ($node ne '') {
        my $output = `"$node" --check "$file" 2>&1`;
        if ($? != 0) {
            print "SYNTAX ERROR in $file\n$output";
            return 0;
        }
        print "syntax ok: $file\n";
        return 1;
    }
    if (-x $jsc) {
        my $check = `"$jsc" -e "try{checkSyntax('$file');print('syntax ok: $file')}catch(e){print('SYNTAX ERROR in $file: '+e)}" 2>&1`;
        print "$check\n";
        return $check !~ /SYNTAX ERROR/;
    }
    print "(no JavaScript engine found to syntax-check $file)\n";
    return 1;
}

my $ok = check($out);
foreach my $plugin (sort glob("$root/plugins/*.js")) {
    $ok = check($plugin) && $ok;
}
exit($ok ? 0 : 1);
