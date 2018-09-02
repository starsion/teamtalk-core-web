var gulp = require('gulp')
var concat = require('gulp-concat')
var minify = require('gulp-minify')
var babel = require("gulp-babel")
var uglify = require('gulp-uglify-es').default
var rename = require('gulp-rename')
var gulpSequence = require('gulp-sequence')

gulp.task(
    'minify', function () {
        return gulp.src([
            './lib/aes.js',
            './lib/Base64.js',
            './lib/md5.min.js',
            './lib/mode-ecb-min.js',
            './lib/pad-nopadding-min.js',
            './lib/protobuf.js',
            './lib/require.js',
            './js/im.js',
            './js/imcore.js',
        ])
            .pipe(concat('common.js'))
            .pipe(minify())
            .pipe(gulp.dest('dist/'))
    }
)


gulp.task(
    'uglify1', function () {
        return gulp.src([
            './dist/common.js',
        ])
            .pipe(uglify({
                mangle: true//是否修改变量名
            }))
            .pipe(rename("common-minify.js"))
            .pipe(gulp.dest('dist/'))
    }
)

gulp.task(
    'uglify2', function () {
        return gulp.src([
            './dist/common-min.js',
        ])
            .pipe(uglify({
                mangle: true
            }))
            .pipe(rename("common-min-minify.js"))
            .pipe(gulp.dest('dist/'))
    }
)

//同步执行任务
gulp.task('build', gulpSequence('minify', 'uglify1', 'uglify2' ,function () {
    console.log('build success.....')
}))
